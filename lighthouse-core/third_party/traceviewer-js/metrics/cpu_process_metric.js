"use strict";
/**
Copyright 2016 The Chromium Authors. All rights reserved.
Use of this source code is governed by a BSD-style license that can be
found in the LICENSE file.
**/

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

require("./metric_registry.js");
require("../value/histogram.js");

'use strict';

global.tr.exportTo('tr.metrics.sh', function () {
  function getCpuSnapshotsFromModel(model) {
    var snapshots = [];
    for (var pid in model.processes) {
      var snapshotInstances = model.processes[pid].objects.getAllInstancesNamed('CPUSnapshots');
      if (!snapshotInstances) continue;
      for (var object of snapshotInstances[0].snapshots) snapshots.push(object.args.processes);
    }
    return snapshots;
  }

  function getProcessSumsFromSnapshot(snapshot) {
    var processSums = new Map();
    for (var processData of snapshot) {
      var processName = processData.name;
      if (!processSums.has(processName)) processSums.set(processName, { sum: 0.0, paths: new Set() });
      processSums.get(processName).sum += parseFloat(processData.pCpu);
      // The process path may be missing on Windows because of AccessDenied
      // error thrown by psutil package used by CPU tracing agent.
      if (processData.path) processSums.get(processName).paths.add(processData.path);
    }
    return processSums;
  }

  function buildNumericsFromSnapshots(snapshots) {
    var processNumerics = new Map();
    for (var snapshot of snapshots) {
      var processSums = getProcessSumsFromSnapshot(snapshot);
      for (var _ref of processSums.entries()) {
        var _ref2 = _slicedToArray(_ref, 2);

        var processName = _ref2[0];
        var processData = _ref2[1];

        if (!processNumerics.has(processName)) {
          processNumerics.set(processName, {
            numeric: new tr.v.Histogram('cpu:percent:' + processName, tr.b.Unit.byName.normalizedPercentage_smallerIsBetter),
            paths: new Set()
          });
        }
        processNumerics.get(processName).numeric.addSample(processData.sum / 100.0);
        for (var path of processData.paths) processNumerics.get(processName).paths.add(path);
      }
    }
    return processNumerics;
  }

  function cpuProcessMetric(values, model) {
    var snapshots = getCpuSnapshotsFromModel(model);
    var processNumerics = buildNumericsFromSnapshots(snapshots);
    for (var _ref3 of processNumerics) {
      var _ref4 = _slicedToArray(_ref3, 2);

      var processName = _ref4[0];
      var processData = _ref4[1];

      var numeric = processData.numeric;
      // Treat missing snapshots as zeros. A process is missing from a snapshots
      // when its CPU usage was below minimum threshold when the snapshot was
      // taken.
      var missingSnapshotCount = snapshots.length - numeric.numValues;
      for (var i = 0; i < missingSnapshotCount; i++) numeric.addSample(0);
      numeric.diagnostics.set('paths', new tr.v.d.Generic([...processData.paths]));
      values.addHistogram(numeric);
    }
  }

  tr.metrics.MetricRegistry.register(cpuProcessMetric);

  return {
    cpuProcessMetric: cpuProcessMetric
  };
});