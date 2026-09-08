package com.rpa.server.common;

public final class Strings {
    private Strings() {}

    /** 按字符数截断，落库 VARCHAR 列宽防御；末尾若是半个代理对再让一位，
     *  否则孤立 surrogate 无法编码为 utf8mb4，插入照样失败。 */
    public static String truncate(String s, int maxChars) {
        if (s == null || s.length() <= maxChars) return s;
        if (maxChars <= 0) return "";
        String cut = s.substring(0, maxChars);
        if (Character.isHighSurrogate(cut.charAt(cut.length() - 1))) {
            cut = cut.substring(0, cut.length() - 1);
        }
        return cut;
    }
}
