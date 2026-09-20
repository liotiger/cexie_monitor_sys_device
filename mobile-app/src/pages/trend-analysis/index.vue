<template>
  <view class="page">
    <view class="cexie-container">
      <view class="page-header">
        <button class="back-button" aria-label="返回" @click="goBack">‹</button>
        <view class="header-main">
          <text class="eyebrow">DATA</text>
          <text class="page-title">查看数据</text>
          <text class="page-description">趋势图与数据列表共享筛选条件。</text>
        </view>
        <view class="header-mark">数</view>
      </view>

      <view class="tab-bar">
        <view class="tab-item" :class="{ active: activeTab === 'trend' }" @click="switchTab('trend')">数据趋势图</view>
        <view class="tab-item" :class="{ active: activeTab === 'list' }" @click="switchTab('list')">数据列表</view>
      </view>

      <view class="filter-card">
        <view class="filter-heading">
          <view>
            <text class="section-title">筛选条件</text>
            <text class="section-subtitle">项目与测孔联动选择</text>
          </view>
          <text class="reset-link" @click="resetFilters">重置</text>
        </view>

        <view class="form-item">
          <text class="label">项目</text>
          <picker
            :range="projectOptions"
            range-key="name"
            :value="projectIndex"
            :disabled="optionsLoading || !projectOptions.length"
            @change="onProjectChange"
          >
            <view class="select-control" :class="{ placeholder: !selectedProject }">
              <text class="select-text">{{ selectedProject ? selectedProject.name : projectPlaceholder }}</text>
              <text class="select-arrow">⌄</text>
            </view>
          </picker>
        </view>

        <view class="form-item">
          <text class="label">测孔</text>
          <picker
            :range="filteredHoles"
            range-key="label"
            :value="holeIndex"
            :disabled="optionsLoading || !filteredHoles.length"
            @change="onHoleChange"
          >
            <view class="select-control" :class="{ placeholder: !selectedHole }">
              <text class="select-text">{{ selectedHole ? selectedHole.label : holePlaceholder }}</text>
              <text class="select-arrow">⌄</text>
            </view>
          </picker>
        </view>

        <view class="date-grid">
          <view class="form-item">
            <text class="label">开始日期</text>
            <picker mode="date" :value="startDate" :end="endDate || today" @change="onStartChange">
              <view class="date-control">{{ startDate || '请选择' }}</view>
            </picker>
          </view>
          <view class="form-item">
            <text class="label">结束日期</text>
            <picker mode="date" :value="endDate" :start="startDate" :end="today" @change="onEndChange">
              <view class="date-control">{{ endDate || '请选择' }}</view>
            </picker>
          </view>
        </view>

        <button class="query-button" :loading="loading || listLoading" :disabled="loading || listLoading || optionsLoading" @click="queryByActiveTab">
          {{ (activeTab === 'trend' ? loading : listLoading) ? '正在查询...' : (activeTab === 'trend' ? '查询趋势图' : '查询数据') }}
        </button>
      </view>

      <view v-if="activeTab === 'trend' && hasQueried && normalizedSeries.length" class="chart-card">
        <view class="chart-heading">
          <view>
            <text class="section-title">累计变形趋势</text>
            <text class="section-subtitle">{{ chartSubtitle }}</text>
          </view>
          <text class="unit-badge">mm / m</text>
        </view>

        <view id="mobile-trend-chart" class="trend-chart" />

        <view class="chart-tip">
          <view class="tip-icon">i</view>
          <text>可拖动图表查看曲线；点击数据点可查看监测时间、深度和累计变形量。</text>
        </view>
      </view>

      <view v-else-if="activeTab === 'trend' && hasQueried && !loading" class="empty-card">
        <view class="empty-icon">⌁</view>
        <text class="empty-title">暂无趋势数据</text>
        <text class="empty-description">当前项目、测孔和日期范围内没有可绘制的成果曲线。</text>
      </view>

      <view v-if="activeTab === 'list'" class="list-card">
        <view class="list-type-bar">
          <view class="list-type-item" :class="{ active: listType === 'results' }" @click="switchListType('results')">成果数据</view>
          <view class="list-type-item" :class="{ active: listType === 'raw' }" @click="switchListType('raw')">原始数据</view>
        </view>

        <view v-if="listLoading" class="list-empty">加载中...</view>

        <view v-else-if="listType === 'results' && hasListQueried && resultList.length" class="list-body">
          <view v-for="item in resultList" :key="item.id" class="list-item">
            <view class="list-item-top">
              <text class="list-item-title">{{ item.hole_code || '-' }}</text>
              <text class="level-badge" :class="levelClass(item.alert_level)">{{ levelText(item.alert_level) }}</text>
            </view>
            <text class="list-item-meta">监测时间 {{ formatDateTime(item.measurement_time) }}</text>
            <view class="list-item-grid">
              <view><text>最大变形值</text><strong>{{ Number(item.max_displacement || 0).toFixed(4) }} mm</strong></view>
              <view><text>最大变形深度</text><strong>{{ Number(item.max_depth || 0).toFixed(2) }} m</strong></view>
            </view>
          </view>
        </view>

        <view v-else-if="listType === 'raw' && hasListQueried && rawList.length" class="list-body">
          <view v-for="item in rawList" :key="item.id" class="list-item">
            <view class="list-item-top">
              <text class="list-item-title">{{ item.relatedHole || '-' }}</text>
              <text class="node-badge">{{ item.nodeNum || 0 }} 节点</text>
            </view>
            <text class="list-item-meta">监测时间 {{ formatDateTime(item.measurementTime) }}</text>
            <text class="list-item-meta">上位机 {{ item.upperImei || '-' }}</text>
            <text class="list-item-meta">下位机 {{ item.lowerDeviceCode || '-' }}</text>
          </view>
        </view>

        <view v-else-if="hasListQueried" class="list-empty">暂无数据</view>
        <view v-else class="list-empty">点击“查询数据”加载列表</view>
      </view>

      <view v-if="optionsLoading" class="loading-card">正在加载项目与测孔...</view>
    </view>

    <BottomNav activeKey="trends" />
  </view>
</template>

<script>
import BottomNav from '../../components/BottomNav.vue';
import { holeApi, resultsApi, rawDataApi } from '../../api';
import { getSelectedProjectId, setSelectedProjectId } from '../../utils/storage';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { DataZoomInsideComponent, GridComponent, LegendScrollComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendScrollComponent,
  DataZoomInsideComponent,
  CanvasRenderer
]);

const COLOR_PALETTE = ['#2f6aa3', '#7c5cb7', '#d05d79', '#c97932', '#2f8567', '#31839a', '#5369bd', '#b95555'];

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default {
  components: { BottomNav },
  data() {
    return {
      activeTab: 'trend',
      listType: 'results',
      allHoles: [],
      projectId: '',
      holeId: '',
      startDate: '',
      endDate: '',
      requestedHoleId: '',
      series: [],
      resultList: [],
      rawList: [],
      listLoading: false,
      listPage: 1,
      listTotal: 0,
      hasListQueried: false,
      optionsLoading: false,
      loading: false,
      hasQueried: false
    };
  },
  computed: {
    today() {
      return formatDate(new Date());
    },
    projectOptions() {
      const projectMap = new Map();
      this.allHoles.forEach((hole) => {
        if (!hole.projectId || projectMap.has(hole.projectId)) {
          return;
        }
        projectMap.set(hole.projectId, { id: hole.projectId, name: hole.projectName });
      });
      return Array.from(projectMap.values());
    },
    filteredHoles() {
      return this.projectId ? this.allHoles.filter(hole => hole.projectId === this.projectId) : [];
    },
    selectedProject() {
      return this.projectOptions.find(project => project.id === this.projectId) || null;
    },
    selectedHole() {
      return this.filteredHoles.find(hole => String(hole.id) === String(this.holeId)) || null;
    },
    projectIndex() {
      const index = this.projectOptions.findIndex(project => project.id === this.projectId);
      return index >= 0 ? index : 0;
    },
    holeIndex() {
      const index = this.filteredHoles.findIndex(hole => String(hole.id) === String(this.holeId));
      return index >= 0 ? index : 0;
    },
    projectPlaceholder() {
      return this.optionsLoading ? '正在加载项目...' : '暂无可选项目';
    },
    holePlaceholder() {
      if (!this.projectId) return '请先选择项目';
      return this.optionsLoading ? '正在加载测孔...' : '当前项目暂无测孔';
    },
    normalizedSeries() {
      return this.series.map((series, index) => ({
        resultId: series.result_id,
        name: series.curve_name || `${series.hole_code || '测孔'} ${series.measurement_time || ''}`,
        measurementTime: series.measurement_time || '-',
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
        points: Array.isArray(series.points)
          ? series.points
            .map(point => ({
              node: point.node,
              depth: Number(point.depth),
              cumulative: Number(point.cumulative_displacement)
            }))
            .filter(point => Number.isFinite(point.depth) && Number.isFinite(point.cumulative))
            .sort((left, right) => left.depth - right.depth)
          : []
      })).filter(series => series.points.length > 0);
    },
    chartSubtitle() {
      if (!this.normalizedSeries.length) return '';
      return `${this.normalizedSeries.length} 条曲线 · 最新 ${this.normalizedSeries[0].measurementTime}`;
    },
    chartPayload() {
      return {
        series: this.normalizedSeries.map(series => ({
          resultId: series.resultId,
          name: series.name,
          measurementTime: series.measurementTime,
          color: series.color,
          points: series.points.map(point => [point.cumulative, point.depth, point.node])
        }))
      };
    }
  },
  onLoad(query) {
    this.requestedHoleId = query && query.hole_ids ? String(query.hole_ids).split(',')[0] : '';
    this.setDefaultDates();
    if (query && query.start_date) this.startDate = String(query.start_date);
    if (query && query.end_date) this.endDate = String(query.end_date);
    this.loadOptions();
  },
  onReady() {
    this._resizeHandler = () => {
      if (this._trendChart) this._trendChart.resize();
    };
    window.addEventListener('resize', this._resizeHandler);
  },
  onShow() {
    this.$nextTick(() => {
      if (this._trendChart) this._trendChart.resize();
    });
  },
  onUnload() {
    window.removeEventListener('resize', this._resizeHandler);
    this.disposeTrendChart();
  },
  methods: {
    goBack() {
      uni.navigateBack({ delta: 1, fail: () => uni.redirectTo({ url: '/pages/projects/index' }) });
    },
    setDefaultDates() {
      const end = new Date();
      const start = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000));
      this.startDate = formatDate(start);
      this.endDate = formatDate(end);
    },
    async loadOptions() {
      if (this.optionsLoading) return;
      this.optionsLoading = true;
      try {
        const res = await holeApi.list({ page: 1, limit: 200 });
        const rows = (res && res.data && res.data.list) || [];
        this.allHoles = rows.map(item => ({
          id: item.id,
          projectId: item.project_id ? String(item.project_id) : '',
          projectName: (item.project && item.project.project_name) || '未命名项目',
          holeNumber: item.hole_number || '-',
          holeName: item.hole_name || '',
          label: item.hole_name ? `${item.hole_number || '-'} · ${item.hole_name}` : (item.hole_number || '-')
        }));

        const requestedHole = this.allHoles.find(hole => String(hole.id) === this.requestedHoleId);
        const storedProjectId = String(getSelectedProjectId() || '');
        const initialProject = requestedHole
          ? requestedHole.projectId
          : (this.projectOptions.some(project => project.id === storedProjectId)
            ? storedProjectId
            : ((this.projectOptions[0] && this.projectOptions[0].id) || ''));

        this.projectId = initialProject;
        const initialHoles = this.filteredHoles;
        this.holeId = requestedHole && requestedHole.projectId === initialProject
          ? String(requestedHole.id)
          : String((initialHoles[0] && initialHoles[0].id) || '');

        if (this.projectId) setSelectedProjectId(this.projectId);
        if (this.holeId) await this.loadTrendData();
      } catch (err) {
        this.allHoles = [];
        uni.showToast({ title: (err && err.message) || '项目与测孔加载失败', icon: 'none' });
      } finally {
        this.optionsLoading = false;
      }
    },
    onProjectChange(e) {
      const project = this.projectOptions[Number(e && e.detail && e.detail.value)];
      this.projectId = project ? project.id : '';
      const firstHole = this.filteredHoles[0];
      this.holeId = firstHole ? String(firstHole.id) : '';
      this.series = [];
      this.hasQueried = false;
      this.disposeTrendChart();
      if (this.projectId) setSelectedProjectId(this.projectId);
    },
    onHoleChange(e) {
      const hole = this.filteredHoles[Number(e && e.detail && e.detail.value)];
      this.holeId = hole ? String(hole.id) : '';
      this.series = [];
      this.hasQueried = false;
      this.disposeTrendChart();
    },
    onStartChange(e) {
      this.startDate = (e && e.detail && e.detail.value) || '';
    },
    onEndChange(e) {
      this.endDate = (e && e.detail && e.detail.value) || '';
    },
    resetFilters() {
      this.setDefaultDates();
      const storedProjectId = String(getSelectedProjectId() || '');
      this.projectId = this.projectOptions.some(project => project.id === storedProjectId)
        ? storedProjectId
        : ((this.projectOptions[0] && this.projectOptions[0].id) || '');
      const firstHole = this.filteredHoles[0];
      this.holeId = firstHole ? String(firstHole.id) : '';
      this.series = [];
      this.hasQueried = false;
      this.disposeTrendChart();
    },
    switchTab(tab) {
      if (this.activeTab === tab) return;
      this.activeTab = tab;
      if (tab === 'trend') {
        // 修复说明：切回趋势图时重建图表实例，避免 DOM 因 v-if 重建后旧实例失效导致空白。
        this.$nextTick(() => {
          if (this.normalizedSeries.length) {
            this.disposeTrendChart();
            this.renderTrendChart();
          }
        });
      } else {
        // 修复说明：切到数据列表时销毁图表实例，确保列表 Tab 只展示数据列表，不残留趋势图。
        this.disposeTrendChart();
      }
    },
    switchListType(type) {
      if (this.listType === type) return;
      this.listType = type;
      if (this.hasListQueried) {
        this.loadListData(1);
      }
    },
    async queryByActiveTab() {
      if (this.activeTab === 'trend') {
        await this.loadTrendData();
      } else {
        await this.loadListData(1);
      }
    },
    async loadListData(page = 1) {
      if (this.listLoading) return;
      if (!this.projectId || !this.holeId) {
        uni.showToast({ title: '请先选择项目和测孔', icon: 'none' });
        return;
      }
      if (this.startDate && this.endDate && this.startDate > this.endDate) {
        uni.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
        return;
      }
      this.listLoading = true;
      try {
        const params = {
          page,
          limit: 20,
          hole_id: this.holeId,
          start_time: this.startDate ? `${this.startDate} 00:00:00` : '',
          end_time: this.endDate ? `${this.endDate} 23:59:59` : ''
        };
        if (this.listType === 'results') {
          const res = await resultsApi.list(params);
          const data = (res && res.data) || {};
          this.resultList = data.list || [];
          this.listTotal = (data.pagination && data.pagination.total) || this.resultList.length;
        } else {
          const res = await rawDataApi.list(params);
          const data = (res && res.data) || {};
          this.rawList = data.list || [];
          this.listTotal = (data.pagination && data.pagination.total) || this.rawList.length;
        }
        this.listPage = page;
        this.hasListQueried = true;
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '数据加载失败', icon: 'none' });
      } finally {
        this.listLoading = false;
      }
    },
    formatDateTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}`;
    },
    levelText(level) {
      if (level === 'alarm') return '红色预警';
      if (level === 'warning') return '黄色预警';
      return '正常';
    },
    levelClass(level) {
      if (level === 'alarm') return 'alarm';
      if (level === 'warning') return 'warning';
      return 'normal';
    },
    async loadTrendData() {
      if (this.loading) return;
      if (!this.projectId) {
        uni.showToast({ title: '请选择项目', icon: 'none' });
        return;
      }
      if (!this.holeId) {
        uni.showToast({ title: '请选择测孔', icon: 'none' });
        return;
      }
      if (this.startDate && this.endDate && this.startDate > this.endDate) {
        uni.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
        return;
      }

      this.loading = true;
      try {
        const res = await resultsApi.trends({
          hole_ids: this.holeId,
          start_time: this.startDate ? `${this.startDate} 00:00:00` : '',
          end_time: this.endDate ? `${this.endDate} 23:59:59` : ''
        });
        this.series = (res && res.data && res.data.list) || [];
        this.hasQueried = true;
        await this.$nextTick();
        this.renderTrendChart();
      } catch (err) {
        this.series = [];
        this.hasQueried = true;
        this.disposeTrendChart();
        uni.showToast({ title: (err && err.message) || '趋势图加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },
    disposeTrendChart() {
      const chartElement = this._trendChartElement;
      if (chartElement) {
        if (this._chartTouchStartHandler) chartElement.removeEventListener('touchstart', this._chartTouchStartHandler);
        if (this._chartTouchMoveHandler) chartElement.removeEventListener('touchmove', this._chartTouchMoveHandler);
        if (this._chartTouchEndHandler) chartElement.removeEventListener('touchend', this._chartTouchEndHandler);
      }
      if (this._trendChart) {
        const zr = this._trendChart.getZr && this._trendChart.getZr();
        if (zr && this._chartPixelClickHandler) {
          zr.off('click', this._chartPixelClickHandler);
        }
        this._trendChart.dispose();
        this._trendChart = null;
      }
      this._trendChartElement = null;
      this._chartSeriesList = null;
      this._chartPixelClickHandler = null;
      this._chartTouchStartHandler = null;
      this._chartTouchMoveHandler = null;
      this._chartTouchEndHandler = null;
      this._chartTouchState = null;
    },
    bindTrendChartEvents() {
      if (!this._trendChart || this._trendChartElement) return;
      const chartElement = this._trendChart.getDom();
      this._trendChartElement = chartElement;
      this._chartPixelClickHandler = (event) => {
        const x = Number.isFinite(event && event.offsetX) ? event.offsetX : event && event.zrX;
        const y = Number.isFinite(event && event.offsetY) ? event.offsetY : event && event.zrY;
        this.showNearestTrendPoint(x, y);
      };
      this._trendChart.getZr().on('click', this._chartPixelClickHandler);

      this._chartTouchStartHandler = (event) => {
        const touch = event && event.touches && event.touches[0];
        if (!touch) return;
        this._chartTouchState = {
          x: touch.clientX,
          y: touch.clientY,
          moved: false,
          multiTouch: event.touches.length > 1
        };
      };
      this._chartTouchMoveHandler = (event) => {
        const state = this._chartTouchState;
        if (!state) return;
        if (!event || !event.touches || event.touches.length !== 1) {
          state.multiTouch = true;
          return;
        }
        const touch = event.touches[0];
        state.moved = state.moved || Math.hypot(touch.clientX - state.x, touch.clientY - state.y) > 12;
      };
      this._chartTouchEndHandler = (event) => {
        const state = this._chartTouchState;
        this._chartTouchState = null;
        const touch = event && event.changedTouches && event.changedTouches[0];
        if (!state || state.moved || state.multiTouch || !touch) return;
        const rect = chartElement.getBoundingClientRect();
        this.showNearestTrendPoint(touch.clientX - rect.left, touch.clientY - rect.top);
      };
      chartElement.addEventListener('touchstart', this._chartTouchStartHandler, { passive: true });
      chartElement.addEventListener('touchmove', this._chartTouchMoveHandler, { passive: true });
      chartElement.addEventListener('touchend', this._chartTouchEndHandler, { passive: true });
    },
    showNearestTrendPoint(x, y) {
      if (!this._trendChart || !this._chartSeriesList || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const nearest = { distance: Infinity, seriesIndex: -1, dataIndex: -1 };
      this._chartSeriesList.forEach((series, seriesIndex) => {
        series.points.forEach((point, dataIndex) => {
          const pixel = this._trendChart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [point[0], point[1]]);
          if (!Array.isArray(pixel) || !Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) return;
          const distance = Math.hypot(pixel[0] - x, pixel[1] - y);
          if (distance < nearest.distance) {
            nearest.distance = distance;
            nearest.seriesIndex = seriesIndex;
            nearest.dataIndex = dataIndex;
          }
        });
      });
      if (nearest.seriesIndex < 0 || nearest.distance > 36) return;
      this._trendChart.dispatchAction({
        type: 'showTip',
        seriesIndex: nearest.seriesIndex,
        dataIndex: nearest.dataIndex
      });
    },
    renderTrendChart() {
      if (!this.normalizedSeries.length) {
        this.disposeTrendChart();
        return;
      }
      const chartElement = document.getElementById('mobile-trend-chart');
      if (!chartElement) return;
      if (!this._trendChart) {
        this._trendChart = echarts.init(chartElement);
        this.bindTrendChartEvents();
      }

      const seriesList = this.chartPayload.series;
      this._chartSeriesList = seriesList;
      const allValues = [];
      seriesList.forEach(series => series.points.forEach(point => allValues.push(Number(point[0]))));
      const minValue = Math.min.apply(null, allValues);
      const maxValue = Math.max.apply(null, allValues);
      const range = maxValue - minValue;
      const padding = range > 0 ? range * 0.1 : (Math.abs(minValue) > 0 ? Math.abs(minValue) * 0.1 : 1);

      this._trendChart.setOption({
        animation: false,
        color: seriesList.map(series => series.color),
        tooltip: {
          trigger: 'item',
          triggerOn: 'mousemove|click',
          renderMode: 'richText',
          confine: true,
          backgroundColor: 'rgba(23, 38, 55, 0.94)',
          borderWidth: 0,
          padding: [9, 11],
          textStyle: {
            color: '#ffffff',
            fontSize: 11,
            lineHeight: 18,
            width: Math.max(180, Math.min(260, chartElement.clientWidth - 44)),
            overflow: 'breakAll'
          },
          formatter(params) {
            const point = params.data || [];
            const series = seriesList[params.seriesIndex] || {};
            return [
              params.seriesName || '-',
              `监测时间：${series.measurementTime || '-'}`,
              `节点号：${point[2] === undefined ? '-' : point[2]}`,
              `深度：${Number(point[1] || 0).toFixed(2)} m`,
              `累计变形量：${Number(point[0] || 0).toFixed(6)} mm`
            ].join('\n');
          }
        },
        legend: {
          type: 'scroll',
          selectedMode: false,
          top: 8,
          left: 8,
          right: 8,
          itemWidth: 14,
          itemHeight: 8,
          pageIconSize: 10,
          textStyle: { color: '#536275', fontSize: 10 },
          data: seriesList.map(series => series.name)
        },
        grid: { left: 55, right: 18, top: 62, bottom: 55, containLabel: false },
        xAxis: {
          type: 'value',
          min: minValue - padding,
          max: maxValue + padding,
          name: '累计变形量 (mm)',
          nameLocation: 'middle',
          nameGap: 34,
          nameTextStyle: { color: '#435164', fontSize: 11, fontWeight: 600 },
          axisLabel: { color: '#758397', fontSize: 9, formatter: value => Number(value).toFixed(2) },
          axisLine: { lineStyle: { color: '#9cabbc' } },
          splitLine: { lineStyle: { color: '#e7edf3', type: 'dashed' } }
        },
        yAxis: {
          type: 'value',
          inverse: true,
          name: '深度 (m)',
          nameLocation: 'middle',
          nameGap: 38,
          nameTextStyle: { color: '#435164', fontSize: 11, fontWeight: 600 },
          axisLabel: { color: '#758397', fontSize: 9 },
          axisLine: { lineStyle: { color: '#9cabbc' } },
          splitLine: { lineStyle: { color: '#e7edf3', type: 'dashed' } }
        },
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: 0,
            filterMode: 'none',
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: true,
            preventDefaultMouseMove: true,
            throttle: 40
          },
          {
            type: 'inside',
            yAxisIndex: 0,
            filterMode: 'none',
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: true,
            preventDefaultMouseMove: true,
            throttle: 40
          }
        ],
        series: seriesList.map((series, index) => ({
          name: series.name,
          type: 'line',
          data: series.points,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: index === 0 ? 9 : 7,
          lineStyle: { width: index === 0 ? 2.5 : 1.5, opacity: index === 0 ? 1 : 0.58 },
          itemStyle: { opacity: index === 0 ? 1 : 0.72 },
          emphasis: { disabled: true }
        }))
      }, true);
      this._trendChart.resize();
    }
  }
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding-bottom: 132rpx;
  background: var(--cexie-background);
}

.page > .cexie-container {
  padding-right: 16rpx;
  padding-left: 16rpx;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin: 8rpx 0 24rpx;
}

.back-button {
  flex: 0 0 62rpx;
  width: 62rpx;
  height: 62rpx;
  margin: 0;
  padding: 0;
  border: 1px solid var(--cexie-border);
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-card);
  color: var(--cexie-primary);
  font-size: 45rpx;
  line-height: 54rpx;
}

.back-button::after {
  border: 0;
}

.header-main {
  flex: 1;
  min-width: 0;
}

.eyebrow,
.page-title,
.page-description,
.section-title,
.section-subtitle,
.label,
.empty-title,
.empty-description {
  display: block;
}

.eyebrow {
  color: var(--cexie-primary);
  font-size: 20rpx;
  line-height: 30rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
}

.page-title {
  margin-top: 4rpx;
  font-size: 38rpx;
  line-height: 52rpx;
  font-weight: 700;
}

.page-description {
  margin-top: 6rpx;
  color: var(--cexie-muted-foreground);
  font-size: 22rpx;
  line-height: 34rpx;
}

.header-mark {
  display: flex;
  flex: 0 0 68rpx;
  align-items: center;
  justify-content: center;
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  background: var(--cexie-primary-soft);
  color: var(--cexie-primary);
  font-size: 27rpx;
  font-weight: 700;
}

.filter-card,
.chart-card,
.list-card,
.empty-card,
.loading-card {
  box-sizing: border-box;
  border: 1px solid var(--cexie-border);
  border-radius: 16px;
  background: var(--cexie-card);
  box-shadow: var(--cexie-shadow-1);
}

.filter-card {
  padding: 20rpx;
}

.tab-bar {
  display: flex;
  gap: 12rpx;
  margin-bottom: 18rpx;
  padding: 10rpx;
  border: 1px solid var(--cexie-border);
  border-radius: 16px;
  background: var(--cexie-card);
  box-shadow: var(--cexie-shadow-1);
}

.tab-item {
  flex: 1;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 26rpx;
  color: var(--cexie-muted-foreground);
}

.tab-item.active {
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
  font-weight: 700;
}

.filter-heading,
.chart-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.filter-heading {
  margin-bottom: 22rpx;
}

.section-title {
  color: var(--cexie-foreground);
  font-size: 28rpx;
  line-height: 40rpx;
  font-weight: 700;
}

.section-subtitle {
  margin-top: 2rpx;
  color: var(--cexie-muted-foreground);
  font-size: 21rpx;
  line-height: 30rpx;
}

.reset-link {
  padding: 10rpx 0 10rpx 20rpx;
  color: var(--cexie-primary);
  font-size: 23rpx;
  font-weight: 700;
}

.form-item + .form-item {
  margin-top: 18rpx;
}

.label {
  margin-bottom: 9rpx;
  color: var(--cexie-foreground);
  font-size: 23rpx;
  line-height: 32rpx;
  font-weight: 600;
}

.select-control,
.date-control {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 76rpx;
  border: 1px solid var(--cexie-border);
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-primary-surface);
  color: var(--cexie-foreground);
  font-size: 24rpx;
}

.select-control {
  justify-content: space-between;
  gap: 16rpx;
  padding: 0 18rpx;
}

.select-control.placeholder {
  color: var(--cexie-muted-foreground);
}

.select-text {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-arrow {
  flex: none;
  color: var(--cexie-primary);
  font-size: 28rpx;
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
  margin-top: 18rpx;
}

.date-grid .form-item {
  min-width: 0;
  margin-top: 0;
}

.date-control {
  justify-content: center;
  padding: 0 10rpx;
  color: var(--cexie-muted-foreground);
  text-align: center;
}

.query-button {
  width: 100%;
  height: 78rpx;
  margin: 24rpx 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-primary);
  color: var(--cexie-primary-foreground);
  font-size: 25rpx;
  line-height: 78rpx;
  font-weight: 700;
  box-shadow: 0 10rpx 20rpx rgba(47, 94, 138, 0.16);
}

.query-button::after {
  border: 0;
}

.chart-card {
  margin-top: 10rpx;
  padding: 14rpx 8rpx 10rpx;
}

.chart-heading {
  padding: 0 6rpx 16rpx;
}

.unit-badge {
  flex: none;
  padding: 7rpx 12rpx;
  border-radius: 999rpx;
  background: var(--cexie-primary-surface);
  color: var(--cexie-primary);
  font-size: 19rpx;
  font-weight: 700;
}

.trend-chart {
  width: 100%;
  height: 880rpx;
  border-radius: var(--cexie-radius-md);
  background: #fbfdff;
  touch-action: none;
  overscroll-behavior: contain;
  user-select: none;
  -webkit-user-select: none;
}

.chart-tip {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  margin-top: 14rpx;
  padding: 14rpx;
  border-radius: var(--cexie-radius-sm);
  background: var(--cexie-primary-surface);
  color: var(--cexie-muted-foreground);
  font-size: 20rpx;
  line-height: 31rpx;
}

.tip-icon {
  display: flex;
  flex: 0 0 27rpx;
  align-items: center;
  justify-content: center;
  width: 27rpx;
  height: 27rpx;
  box-sizing: border-box;
  margin-top: 2rpx;
  border: 1px solid var(--cexie-primary);
  border-radius: 50%;
  color: var(--cexie-primary);
  font-size: 18rpx;
  font-weight: 700;
}

.empty-card,
.loading-card {
  margin-top: 18rpx;
  padding: 64rpx 32rpx;
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  margin: 0 auto;
  border-radius: 24rpx;
  background: var(--cexie-primary-surface);
  color: var(--cexie-primary);
  font-size: 38rpx;
  font-weight: 700;
}

.empty-title {
  margin-top: 18rpx;
  font-size: 28rpx;
  line-height: 40rpx;
  font-weight: 700;
}

.empty-description,
.loading-card {
  color: var(--cexie-muted-foreground);
  font-size: 22rpx;
  line-height: 34rpx;
}

.empty-description {
  margin-top: 8rpx;
}

.list-card {
  margin-top: 10rpx;
  padding: 20rpx;
}

.list-type-bar {
  display: flex;
  gap: 10rpx;
  padding: 8rpx;
  border-radius: 10px;
  background: var(--cexie-primary-surface);
}

.list-type-item {
  flex: 1;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 24rpx;
  color: var(--cexie-muted-foreground);
}

.list-type-item.active {
  background: var(--cexie-card);
  color: var(--cexie-primary);
  font-weight: 700;
}

.list-body {
  margin-top: 18rpx;
}

.list-item {
  padding: 20rpx 0;
  border-top: 1px solid var(--cexie-divider);
}

.list-item:first-child {
  border-top: 0;
}

.list-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.list-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 28rpx;
  font-weight: 700;
}

.list-item-meta {
  display: block;
  margin-top: 8rpx;
  color: var(--cexie-muted-foreground);
  font-size: 22rpx;
}

.list-item-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
  margin-top: 14rpx;
}

.list-item-grid view {
  min-width: 0;
  padding: 14rpx;
  border-radius: 8px;
  background: var(--cexie-primary-surface);
}

.list-item-grid text {
  display: block;
  color: var(--cexie-muted-foreground);
  font-size: 20rpx;
}

.list-item-grid strong {
  display: block;
  margin-top: 5rpx;
  color: var(--cexie-foreground);
  font-size: 24rpx;
  word-break: break-all;
}

.level-badge,
.node-badge {
  flex: none;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 20rpx;
  font-weight: 600;
}

.level-badge.normal {
  background: #e7f4ee;
  color: var(--cexie-success);
}

.level-badge.warning {
  background: #fdf3e2;
  color: var(--cexie-warning);
}

.level-badge.alarm {
  background: #faecec;
  color: var(--cexie-error);
}

.node-badge {
  background: var(--cexie-primary-soft);
  color: var(--cexie-primary);
}

.list-empty {
  padding: 48rpx 16rpx;
  text-align: center;
  color: var(--cexie-muted-foreground);
  font-size: 23rpx;
}
</style>
