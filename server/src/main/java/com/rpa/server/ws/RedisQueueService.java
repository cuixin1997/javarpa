package com.rpa.server.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** Pending command queue for offline devices, backed by Redis list. */
@Service
public class RedisQueueService {
    private static final Logger log = LoggerFactory.getLogger(RedisQueueService.class);
    private static final String KEY_PREFIX = "rpa:pending:";
    private static final String PROCESSING_SUFFIX = ":processing";
    private static final Duration TTL = Duration.ofDays(7);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    // 崩溃恢复：processing 尾部逐条弹回待发队列头部。Lua 单脚本原子执行，
    // 否则 RPOP 与 LPUSH 之间进程崩溃会静默丢命令
    private static final RedisScript<Long> RECOVER_ALL = RedisScript.of(
            "for i=1,200 do local v=redis.call('RPOP',KEYS[1]) if not v then break end "
                    + "redis.call('LPUSH',KEYS[2],v) end return 1", Long.class);
    // 发送失败回滚：回灌待发队列 + 从 processing 移除。两步间隙崩溃会让命令双份存在，
    // 设备上线后重复执行
    private static final RedisScript<Long> NACK_AND_REMOVE = RedisScript.of(
            "redis.call('RPUSH',KEYS[1],ARGV[1]) redis.call('LREM',KEYS[2],1,ARGV[1]) return 1", Long.class);

    private final StringRedisTemplate redis;

    public RedisQueueService(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void pushPending(long deviceId, WsMessage msg) {
        try {
            ListOperations<String, String> ops = redis.opsForList();
            ops.rightPush(KEY_PREFIX + deviceId, json(msg));
            redis.expire(KEY_PREFIX + deviceId, TTL);
        } catch (Exception e) {
            log.error("push pending for device {} failed: {}", deviceId, e.getMessage());
        }
    }

    /** 崩溃恢复：processing 中未 ACK 的命令按原顺序回灌待发队列头部（最多 200 条）。 */
    public void recoverProcessing(long deviceId) {
        try {
            redis.execute(RECOVER_ALL, List.of(
                    KEY_PREFIX + deviceId + PROCESSING_SUFFIX, KEY_PREFIX + deviceId));
            redis.expire(KEY_PREFIX + deviceId, TTL);
        } catch (Exception e) {
            log.error("recover processing for device {} failed: {}", deviceId, e.getMessage());
        }
    }

    /** 待发命令及其原始 JSON。ACK/回滚都按原始字节匹配，避免反序列化再序列化不圆整导致静默残留。 */
    public record PendingCommand(String json, WsMessage msg) {}

    /** LMOVE 到 processing 队列后返回待发送命令（最多 50 条），发送结果用 ack/nack 结算。 */
    public List<PendingCommand> drainPending(long deviceId) {
        List<PendingCommand> result = new ArrayList<>();
        try {
            String src = KEY_PREFIX + deviceId;
            String processing = src + PROCESSING_SUFFIX;
            for (int i = 0; i < 50; i++) {
                // 签名为 move(sourceKey, from, destinationKey, to)：队头取出、队尾入 processing，保持 FIFO；未 ACK 前不丢
                String json = redis.opsForList().move(src,
                        org.springframework.data.redis.connection.RedisListCommands.Direction.LEFT,
                        processing,
                        org.springframework.data.redis.connection.RedisListCommands.Direction.RIGHT);
                if (json == null) break;
                result.add(new PendingCommand(json, MAPPER.readValue(json, WsMessage.class)));
            }
            if (!result.isEmpty()) {
                // processing 同样设 TTL：设备被删除后残留的半处理命令不会永久占据 Redis
                redis.expire(processing, TTL);
            }
        } catch (Exception e) {
            log.error("drain pending for device {} failed: {}", deviceId, e.getMessage());
        }
        return result;
    }

    /** 发送成功后确认，从 processing 队列移除。 */
    public void ackPending(long deviceId, PendingCommand cmd) {
        try {
            redis.opsForList().remove(KEY_PREFIX + deviceId + PROCESSING_SUFFIX, 1, cmd.json());
        } catch (Exception e) {
            log.warn("ack pending for device {} failed: {}", deviceId, e.getMessage());
        }
    }

    /** 发送失败回滚：命令重回待发队列尾部并从 processing 移除（单脚本原子），避免静默丢失或双份重发。 */
    public void nackPending(long deviceId, PendingCommand cmd) {
        try {
            redis.execute(NACK_AND_REMOVE, List.of(
                    KEY_PREFIX + deviceId, KEY_PREFIX + deviceId + PROCESSING_SUFFIX), cmd.json());
            redis.expire(KEY_PREFIX + deviceId, TTL);
        } catch (Exception e) {
            log.error("nack pending for device {} failed: {}", deviceId, e.getMessage());
        }
    }

    private String json(WsMessage msg) {
        try {
            return MAPPER.writeValueAsString(msg);
        } catch (Exception e) {
            // 返回 "" 会被 nackPending 推入队列成为毒消息，卡死后续 drain，必须抛出让外层记录
            throw new IllegalStateException("WsMessage 序列化失败", e);
        }
    }
}
