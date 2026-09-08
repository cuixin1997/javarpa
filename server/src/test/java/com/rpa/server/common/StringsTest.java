package com.rpa.server.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class StringsTest {

    @Test
    void nullAndShortPassthrough() {
        assertNull(Strings.truncate(null, 10));
        assertEquals("", Strings.truncate("", 10));
        assertEquals("abc", Strings.truncate("abc", 10));
        assertEquals("abcdefghij", Strings.truncate("abcdefghij", 10)); // 恰好等于上限不截
    }

    @Test
    void truncateToLimit() {
        assertEquals("abcde", Strings.truncate("abcdefgh", 5));
    }

    @Test
    void surrogatePairNotSplit() {
        // 😈 = 一对 surrogate；第 5 个 code unit 恰好是高代理时须让位，产出仍是合法字符串
        String emoji = "a😈b😈c😈d😈";
        String cut = Strings.truncate(emoji, 5);
        assertEquals(4, cut.length());
        assertEquals("a😈b", cut);
        // 截断结果必须能被 UTF-8 往返编码（孤立 surrogate 编不出）
        assertEquals(cut, new String(cut.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void negativeOrZeroLimitYieldsEmptyOrHalf() {
        assertEquals("", Strings.truncate("abc", 0));
    }
}
