function buildUsageVolume(data) {
  function number(value) {
    return Number(value || 0).toLocaleString('en', {maximumFractionDigits: 2});
  }
  const points = (data.points || []).map(function (point) {return [Date.parse(point.time), point.requests];});
  return {
    title: [
      {text: 'Request volume', subtext: 'Normal API traffic; scheduled probes and preflights excluded'},
      {text: data.from && data.to ? data.from + ' to ' + data.to + ' · 5-minute buckets · weighted sampling estimates' : 'Awaiting real measurements; no historical traffic is invented'}
    ],
    color: ['#61A9BD'],
    xAxis: {type: 'time'},
    yAxis: {type: 'value', min: 0, axisLabel: {formatter: number}},
    tooltip: {trigger: 'axis', formatter: function (params) {
      if (!params) return '';
      const point = Array.isArray(params) ? params[0] : params;
      if (!point || !Array.isArray(point.value)) return '';
      return new Date(point.value[0]).toISOString() + ': ' + number(point.value[1]) + ' requests';
    }},
    series: [{
      name: 'Requests', type: 'line', areaStyle: {}, showSymbol: points.length < 10,
      data: points,
      label: {show: true, formatter: function (point) {
        return points.length < 10 || point.dataIndex === points.length - 1 ? number(point.value[1]) : '';
      }}
    }]
  };
}
