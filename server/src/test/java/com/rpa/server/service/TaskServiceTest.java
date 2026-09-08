package com.rpa.server.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.rpa.server.entity.Script;
import com.rpa.server.entity.Task;
import com.rpa.server.mapper.DeviceMapper;
import com.rpa.server.mapper.ScriptMapper;
import com.rpa.server.mapper.ScriptVersionMapper;
import com.rpa.server.mapper.TaskDeviceMapper;
import com.rpa.server.mapper.TaskMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TaskServiceTest {
    private TaskMapper taskMapper;
    private TaskDeviceMapper taskDeviceMapper;
    private ScriptService scriptService;
    private TaskService taskService;

    @BeforeEach
    void setup() {
        taskMapper = mock(TaskMapper.class);
        taskDeviceMapper = mock(TaskDeviceMapper.class);
        scriptService = mock(ScriptService.class);
        taskService = new TaskService(taskMapper, taskDeviceMapper, mock(ScriptMapper.class),
                mock(ScriptVersionMapper.class), mock(DeviceMapper.class),
                scriptService, mock(TaskSchedulerService.class));
    }

    private Task task(long id, String name) {
        Task t = new Task();
        t.id = id;
        t.name = name;
        t.scriptId = 10L;
        t.status = 1;
        return t;
    }

    @Test
    void listAggregatesDeviceCountsInOneQuery() {
        when(taskMapper.selectList(any(QueryWrapper.class)))
                .thenReturn(List.of(task(1, "t1"), task(2, "t2")));
        Script s = new Script();
        s.id = 10L;
        s.name = "sc";
        when(scriptService.list()).thenReturn(List.of(s));
        when(taskDeviceMapper.selectMaps(any(QueryWrapper.class))).thenReturn(List.of(
                Map.of("task_id", 1L, "total", 3L, "running", 1L),
                Map.of("task_id", 2L, "total", 0L, "running", 0L)));

        List<Map<String, Object>> list = taskService.list();

        assertEquals(2, list.size());
        Map<String, Object> first = list.get(0);
        assertEquals(1L, first.get("id"));
        assertEquals("sc", first.get("scriptName"));
        assertEquals(3L, first.get("deviceCount"));
        assertEquals(1L, first.get("runningCount"));
        assertEquals(0L, list.get(1).get("deviceCount"));
        // 统计只允许一条聚合 SQL，不允许退化回逐任务 count
        verify(taskDeviceMapper, times(1)).selectMaps(any(QueryWrapper.class));
        verify(taskDeviceMapper, never()).selectCount(any());
    }

    @Test
    void taskWithoutDevicesDefaultsToZero() {
        when(taskMapper.selectList(any(QueryWrapper.class))).thenReturn(List.of(task(7, "t7")));
        when(scriptService.list()).thenReturn(List.of());
        when(taskDeviceMapper.selectMaps(any(QueryWrapper.class))).thenReturn(List.of());

        List<Map<String, Object>> list = taskService.list();

        assertEquals(0L, list.get(0).get("deviceCount"));
        assertEquals(0L, list.get(0).get("runningCount"));
    }
}
