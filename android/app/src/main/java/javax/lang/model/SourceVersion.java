package javax.lang.model;

/**
 * Rhino 1.7.14 的 JavaMembers 静态初始化引用 javax.lang.model.SourceVersion
 * （用于判断 Java 9+ 严格反射语义），该类在 Android 运行时不存在，
 * 缺失会导致脚本首次包装 Java 对象时 NoClassDefFoundError 直接崩溃整个进程。
 *
 * 这里提供最小实现：latestSupported() 固定返回 RELEASE_8，
 * 使 Rhino 走 Java 8 宽松语义（STRICT_REFLECTIVE_ACCESS=false），与
 * 桌面 JVM 上的既有行为一致。全 jar 仅 JavaMembers 一处引用。
 */
public enum SourceVersion {
    RELEASE_0, RELEASE_1, RELEASE_2, RELEASE_3,
    RELEASE_4, RELEASE_5, RELEASE_6, RELEASE_7, RELEASE_8;

    public static SourceVersion latestSupported() {
        return RELEASE_8;
    }

    /** 标识符合法性校验（Rhino 用于动态成员查找）；宽松放行非空串即可 */
    public static boolean isName(CharSequence name) {
        return name != null && name.length() > 0;
    }
}
