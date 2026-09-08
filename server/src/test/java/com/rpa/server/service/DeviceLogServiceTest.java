package com.rpa.server.service;

import com.rpa.server.entity.DeviceLog;
import com.rpa.server.mapper.DeviceLogMapper;
import com.rpa.server.ws.AdminStompService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class DeviceLogServiceTest {
    private DeviceLogMapper deviceLogMapper;
    private DeviceLogService service;

    @BeforeEach
    void setup() {
        deviceLogMapper = mock(DeviceLogMapper.class);
        // Executor 直接同步执行，方便捕获落库对象
        service = new DeviceLogService(deviceLogMapper, mock(AdminStompService.class), Runnable::run);
    }

    private DeviceLog captured() {
        ArgumentCaptor<DeviceLog> captor = ArgumentCaptor.forClass(DeviceLog.class);
        verify(deviceLogMapper, org.mockito.Mockito.atLeastOnce()).insert(captor.capture());
        return captor.getValue(); // 多次调用时取最后一次
    }

    @Test
    void logTimeTakesDeviceMillis() {
        Map<String, Object> data = new HashMap<>();
        data.put("level", "INFO");
        data.put("content", "hello");
        data.put("logTime", 1757000000123L);
        service.onDeviceLog(9L, data);
        DeviceLog entry = captured();
        assertEquals(LocalDateTime.ofInstant(
                java.time.Instant.ofEpochMilli(1757000000123L),
                java.time.ZoneId.systemDefault()), entry.logTime);
    }

    @Test
    void logTimeAcceptsSecondsAndFallsBack() {
        Map<String, Object> sec = new HashMap<>();
        sec.put("logTime", 1757000000L); // 秒级时间戳
        service.onDeviceLog(9L, sec);
        assertEquals(LocalDateTime.ofInstant(
                java.time.Instant.ofEpochSecond(1757000000L),
                java.time.ZoneId.systemDefault()), captured().logTime);

        Map<String, Object> missing = new HashMap<>();
        service.onDeviceLog(9L, missing);
        assertNotNull(captured().logTime);
    }

    @Test
    void columnsTruncatedToSchemaWidth() {
        Map<String, Object> data = new HashMap<>();
        data.put("level", "L".repeat(20));   // 列宽 8
        data.put("tag", "T".repeat(100));    // 列宽 64
        data.put("content", "C".repeat(5000)); // 列宽 2000
        service.onDeviceLog(9L, data);
        DeviceLog entry = captured();
        assertEquals(8, entry.level.length());
        assertEquals(64, entry.tag.length());
        assertEquals(2000, entry.content.length());
    }

    @Test
    void invalidTaskIdIgnored() {
        Map<String, Object> data = new HashMap<>();
        data.put("taskId", "not-a-number");
        service.onDeviceLog(9L, data);
        assertNull(captured().taskId);
    }

    @Test
    void stompPushIncludesDeviceId() {
        AdminStompService stomp = mock(AdminStompService.class);
        DeviceLogService svc = new DeviceLogService(deviceLogMapper, stomp, Runnable::run);
        Map<String, Object> data = new HashMap<>();
        data.put("content", "x");
        svc.onDeviceLog(42L, data);
        verify(stomp).pushDeviceLog(anyLong(), anyMap());
    }
}
