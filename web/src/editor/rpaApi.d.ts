/**
 * JavaRPA 设备端脚本 API 类型声明（Monaco 补全数据源）
 *
 * 与 docs/script-development.md 及 android/app/src/main/java/com/rpa/engine/api/ 下的源码
 * 一一对应；设备端 API 变更时必须同步本文件，否则编辑器提示会与实际行为不一致。
 * 运行环境：Rhino 1.7.14（建议 ES5 风格），纯同步阻塞模型，无 Promise/DOM。
 */

/** 屏幕坐标点（findColor / findImage 的返回值） */
interface RpaPoint {
  x: number;
  y: number;
}

/** 控件矩形（屏幕绝对像素） */
interface RpaRect {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** 设备信息（device.info 的结构） */
interface RpaDeviceInfo {
  /** 机型，如 Pixel 6 */
  model: string;
  /** 品牌，如 google */
  brand: string;
  /** Android SDK 版本号，如 33 */
  sdkInt: number;
  /** Android 版本名，如 "13" */
  androidVersion: string;
  /** 屏幕参数 */
  screen: {
    width: number;
    height: number;
    density: number;
  };
}

/** 业务计数上报子对象（auto.report） */
interface ReportApi {
  /** 成功计数 +1 */
  ok(): void;
  /** 失败计数 +1 */
  fail(): void;
  /** 成功计数 +n */
  okN(n: number): void;
  /** 失败计数 +n */
  failN(n: number): void;
  /** 读当前成功计数（随心跳上报云端） */
  getOk(): number;
  /** 读当前失败计数 */
  getFail(): number;
}

/** 截图对象（auto.screenshot() 的返回值，Android 11+） */
interface ImageApi {
  /** 截图宽（像素） */
  readonly width: number;
  /** 截图高（像素） */
  readonly height: number;
  /**
   * 取指定点颜色，返回 "#RRGGBB" 字符串；越界返回 null
   * @param x 横坐标（像素）
   * @param y 纵坐标（像素）
   */
  pixel(x: number, y: number): string | null;
  /**
   * 全屏按行扫描找第一个匹配颜色的点，未找到返回 null
   * @param colorHex 目标颜色，如 "#FF0000"
   * @param threshold R/G/B 各自容差，找色建议 0~10
   */
  findColor(colorHex: string, threshold: number): RpaPoint | null;
  /**
   * 模板匹配找图，返回模板左上角坐标，未找到返回 null
   * @param relPath 模板图片在脚本包内的相对路径，如 "res/btn.png"
   * @param threshold 相似度容差，找图建议 8~16
   */
  findImage(relPath: string, threshold: number): RpaPoint | null;
  /**
   * 保存 PNG 到脚本包目录
   * @param relPath 目标相对路径，路径越出包目录返回 false
   */
  save(relPath: string): boolean;
}

/** 控件节点（findOne / find 的返回值） */
interface NodeApi {
  /**
   * 点击该控件：优先控件点击；不可点击时向上最多 5 层找可点击父级；
   * 仍失败时对控件中心坐标点击兜底
   */
  click(): boolean;
  /**
   * 清空后输入文本（无障碍 SET_TEXT）
   * @param text 要输入的内容
   */
  input(text: string): boolean;
  /** 向前滚动该容器 */
  scrollForward(): boolean;
  /** 控件文本（可能为 null） */
  text(): string | null;
  /** contentDescription（可能为 null） */
  desc(): string | null;
  /** 完整 viewId，如 "com.xx:id/btn_ok" */
  id(): string;
  /** 屏幕坐标矩形 */
  rect(): RpaRect;
  /** 探测节点是否仍有效（界面刷新后可能失效） */
  exists(): boolean;
  /** 释放节点（API<33 有效），长任务建议调用以避免节点池耗尽 */
  close(): void;
}

/** 控件选择器：由 auto.text() / auto.id() 等构造，链式追加条件后取结果 */
interface SelectorApi {
  /** 追加「文本完全相等」条件 */
  text(s: string): SelectorApi;
  /** 追加「文本包含」条件（动态后缀文本首选） */
  textContains(s: string): SelectorApi;
  /** 追加 viewId 后缀条件（com.xx:id/btn_ok 只传 btn_ok） */
  id(s: string): SelectorApi;
  /** 追加 contentDescription 完全相等条件 */
  desc(s: string): SelectorApi;
  /** 追加控件类名条件，如 "android.widget.EditText" */
  type(cls: string): SelectorApi;
  /** 追加是否可点击条件 */
  clickable(b: boolean): SelectorApi;
  /**
   * 轮询查找控件（间隔 200ms），超时返回 null；findOne(0) 只查一次不等待
   * @param timeoutMs 超时毫秒数，如 8000
   */
  findOne(timeoutMs: number): NodeApi | null;
  /** 等价 findOne(0)，立即查找一次 */
  find(): NodeApi | null;
  /** 是否存在匹配控件 */
  exists(): boolean;
  /** 返回全部匹配节点（长列表注意数量） */
  findAll(): NodeApi[];
}

/** 自动化 API 总入口（脚本全局变量） */
declare const auto: {
  /**
   * 启动 App
   * @param pkg 包名，如 "com.tencent.mm"
   * @returns 未安装或启动失败返回 false
   */
  launch(pkg: string): boolean;
  /** 按返回键 */
  back(): boolean;
  /** 回到桌面 */
  home(): boolean;
  /**
   * 坐标点击（约 50ms 手势），屏幕绝对像素
   * @param x 横坐标
   * @param y 纵坐标
   */
  tap(x: number, y: number): boolean;
  /**
   * 滑动，默认 300ms
   * @param x1 起点横坐标 @param y1 起点纵坐标
   * @param x2 终点横坐标 @param y2 终点纵坐标
   */
  swipe(x1: number, y1: number, x2: number, y2: number): boolean;
  /**
   * 滑动（指定时长）
   * @param durationMs 滑动时长毫秒数
   */
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): boolean;
  /**
   * 截全屏（Android 11+），像素即时拷入内存；失败返回 null。
   * 返回值用于 findColor / findImage / pixel / save
   */
  screenshot(): ImageApi | null;
  /**
   * 读脚本包内 UTF-8 文本资源（路径不得越出包目录）
   * @param relPath 包内相对路径，如 "res/config.txt"
   * @returns 文件不存在返回 null
   */
  readText(relPath: string): string | null;
  /** 构造「文本完全相等」选择器 */
  text(s: string): SelectorApi;
  /** 构造「文本包含」选择器（动态后缀文本首选） */
  textContains(s: string): SelectorApi;
  /** 构造 viewId 后缀选择器（com.xx:id/btn_ok 只传 btn_ok） */
  id(s: string): SelectorApi;
  /** 构造 contentDescription 全等选择器 */
  desc(s: string): SelectorApi;
  /** 等价 auto.text(s).findOne(8000) 后点击，找到并点击返回 true */
  clickText(text: string): boolean;
  /** 等价 auto.id(s).findOne(8000) 后点击，找到并点击返回 true */
  clickId(id: string): boolean;
  /** 无障碍服务是否已开启（建议脚本开头自检） */
  isAccessibilityOn(): boolean;
  /** 当前是否处于暂停状态 */
  isPaused(): boolean;
  /** 暂停检查点：暂停时阻塞；被停止时抛异常结束。长循环体内必须周期调用 */
  waitIfPaused(): void;
  /** 仅标记结束：脚本跑到自然结束，结果记 STOPPED（不触发重试） */
  stop(): void;
  /** 业务计数上报 */
  readonly report: ReportApi;
};

/** 设备信息（脚本全局变量） */
declare const device: {
  /** 设备信息（型号/品牌/系统版本/屏幕参数） */
  readonly info: RpaDeviceInfo;
  /** 屏幕宽（像素） */
  readonly width: number;
  /** 屏幕高（像素） */
  readonly height: number;
};

/**
 * 打日志并实时上报云端，参数以空格拼接输出。
 * 注意对象会打印成 [object Object]，需先 JSON.stringify
 */
declare function log(...args: any[]): void;

/** 设备屏幕弹短提示（不阻塞） */
declare function toast(msg: string): void;

/**
 * 睡眠等待；期间响应云端停止（线程中断，在最近一次 sleep 点退出）
 * @param ms 等待毫秒数
 */
declare function sleep(ms: number): void;

/** 任务参数（建任务时填写的 JSON 对象），未配置时为 {} */
declare const params: any;
