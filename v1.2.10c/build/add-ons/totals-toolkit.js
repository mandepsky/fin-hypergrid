(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var totalsToolkit = {
    preinstall: function(Hypergrid) {
        Hypergrid.mixIn(require('./mix-ins/grid'));

        var Behavior = Hypergrid.constructor.behaviors.Behavior;
        Behavior.prototype.mixIn(require('./mix-ins/behavior'));
    }
};

window.fin.Hypergrid.totalsToolkit = totalsToolkit;

},{"./mix-ins/behavior":2,"./mix-ins/grid":3}],2:[function(require,module,exports){
'use strict';

module.exports = {

    /** @typedef {Array} valueList
     * @desc One of:
     * * `activeColumnsList` falsy - Array of row values semantically congruent to `this.columns`.
     * * `activeColumnsList` truthy - Array of row values semantically congruent to `this.allColumns`.
     */

    /**
     * @param {number} x - Column index. If you have an "active" column index, you can translate it with `this.getActiveColumn(x).index`.
     * @param {number} y - Totals row index, local to the totals area.
     * @param value
     * @param {string|string[]} [areas=['top', 'bottom']] - may include `'top'` and/or `'bottom'`
     * @memberOf Behavior.prototype
     */
    setTotalsValue: function(x, y, value, areas) {
        if (!areas) {
            areas = [];
            if (this.subgrids.lookup.topTotals) { areas.push('top'); }
            if (this.subgrids.lookup.bottomTotal) { areas.push('bottom'); }
        } else if (!Array.isArray(areas)) {
            areas = [areas];
        }
        areas.forEach(function(area) {
            this.getTotals(area)[y][x] = value;
        }, this);
        this.grid.setTotalsValueNotification(x, y, value, areas);
    },

    /**
     * @summary Set the top total row(s).
     * @param {valueList[]} [rows] - Array of 0 or more rows containing summary data. Omit to set to empty array.
     * @param {boolean} [activeColumnsList=false]
     * @memberOf Behavior.prototype
     */
    setTopTotals: function(rows, activeColumnsList) {
        return this.setTotals('top', rows, activeColumnsList);
    },

    /**
     * @summary Get the top total row(s).
     * @returns {valueList[]}
     * @param {boolean} [activeColumnsList=false]
     * @returns {valueList|Array} Full data row object, or object containing just the "active" columns, per `activeColumnsList`.
     * @memberOf Behavior.prototype
     */
    getTopTotals: function(activeColumnsList) {
        return this.getTotals('top', activeColumnsList);
    },

    /**
     * @summary Set the bottom totals.
     * @param {valueList[]} rows - Array of 0 or more rows containing summary data. Omit to set to empty array.
     * @param {boolean} [activeColumnsList=false] - If `true`, `rows` only contains active columns.
     * @memberOf Behavior.prototype
     */
    setBottomTotals: function(rows, activeColumnsList) {
        return this.setTotals('bottom', rows, activeColumnsList);
    },

    /**
     * @summary Get the bottom total row(s).
     * @param {boolean} [activeColumnsList=false]
     * @returns {valueList} Full data row object, or object containing just the "active" columns, per `activeColumnsList`.
     * @memberOf Behavior.prototype
     */
    getBottomTotals: function(activeColumnsList) {
        return this.getTotals('bottom', activeColumnsList);
    },

    /**
     *
     * @param {string} key
     * @param {valueList[]} rows
     * @param {boolean} [activeColumnsList=false]
     * @returns {valueList[]}
     * @returns {*}
     * @memberOf Behavior.prototype
     */
    setTotals: function(key, rows, activeColumnsList) {
        key += 'Totals';

        var totals = this.subgrids.lookup[key];

        if (!totals) {
            throw new this.HypergridError('Expected subgrids.' + key + '.');
        }

        if (!Array.isArray(rows)) {
            // if not an array, fail silently
            rows = [];
        } else if (rows.length && !Array.isArray(rows[0])) {
            // if an unnested array representing a single row, nest it
            rows = [rows];
        }

        if (activeColumnsList) {
            rows.forEach(function(row, i, rows) {
                rows[i] = this.expandActiveRowToDataRow(row);
            }, this);
        }

        var newRowCount = rows.length,
            oldRowCount = totals.getRowCount();

        totals.setData(rows);

        if (newRowCount === oldRowCount) {
            this.grid.repaint();
        } else {
            this.grid.behavior.shapeChanged();
        }

        return rows;
    },

    /**
     *
     * @param key
     * @param {boolean} [activeColumnsList=false]
     * @returns {valueList} Full data row object, or object containing just the "active" columns, per `activeColumnsList`.
     * @memberOf Behavior.prototype
     */
    getTotals: function(key, activeColumnsList) {
        key += 'Totals';

        var rows = this.subgrids.lookup[key];
        rows = rows ? rows.getData() : [];

        if (activeColumnsList) {
            rows.forEach(function(row, i, rows) {
                rows[i] = this.collapseDataRowToActiveRow(row);
            }, this);
        }

        return rows;
    },

    /**
     * @param {boolean} [activeColumnsList=false]
     * @returns {valueList}
     * @memberOf Behavior.prototype
     */
    expandActiveRowToDataRow: function(activeColumnValues) {
        var dataRow = Array(this.allColumns.length);

        this.columns.forEach(function(column, i) {
            if (activeColumnValues[i] !== undefined) {
                dataRow[column.index] = activeColumnValues[i];
            }
        });

        return dataRow;
    },

    /**
     * @param {boolean} [activeColumnsList=false]
     * @returns {valueList}
     * @memberOf Behavior.prototype
     */
    collapseDataRowToActiveRow: function(allColumnValues) {
        var dataRow = Array(this.columns.length);

        this.columns.forEach(function(column, i) {
            if (allColumnValues[column.index] !== undefined) {
                dataRow[i] = allColumnValues[column.index];
            }
        });

        return dataRow;
    }

};

},{}],3:[function(require,module,exports){
/* eslint-env browser */

'use strict';

module.exports = {

    /**
     * @memberOf Hypergrid.prototype
     * @param {number} x - column index
     * @param {number} y - totals row index local to the totals area
     * @param value
     * @param {string[]} [areas=['top', 'bottom']] - may include `'top'` and/or `'bottom'`
     */
    setTotalsValueNotification: function(x, y, value, areas) {
        this.fireSyntheticSetTotalsValue(x, y, value, areas);
    },

    /**
     * @memberOf Hypergrid.prototype
     * @param {number} x - column index
     * @param {number} y - totals row index local to the totals area
     * @param value
     * @param {string[]} [areas=['top', 'bottom']] - may include `'top'` and/or `'bottom'`
     */
    fireSyntheticSetTotalsValue: function(x, y, value, areas) {
        var clickEvent = new CustomEvent('fin-set-totals-value', {
            detail: {
                x: x,
                y: y,
                value: value,
                areas: areas
            }
        });
        this.canvas.dispatchEvent(clickEvent);
    }

};

},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9qb25hdGhhbi9yZXBvcy9maW4taHlwZXJncmlkL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvam9uYXRoYW4vcmVwb3MvZmluLWh5cGVyZ3JpZC9hZGQtb25zL3RvdGFscy10b29sa2l0L2Zha2VfOWQ2NWZjYjIuanMiLCIvVXNlcnMvam9uYXRoYW4vcmVwb3MvZmluLWh5cGVyZ3JpZC9hZGQtb25zL3RvdGFscy10b29sa2l0L21peC1pbnMvYmVoYXZpb3IuanMiLCIvVXNlcnMvam9uYXRoYW4vcmVwb3MvZmluLWh5cGVyZ3JpZC9hZGQtb25zL3RvdGFscy10b29sa2l0L21peC1pbnMvZ3JpZC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdG90YWxzVG9vbGtpdCA9IHtcbiAgICBwcmVpbnN0YWxsOiBmdW5jdGlvbihIeXBlcmdyaWQpIHtcbiAgICAgICAgSHlwZXJncmlkLm1peEluKHJlcXVpcmUoJy4vbWl4LWlucy9ncmlkJykpO1xuXG4gICAgICAgIHZhciBCZWhhdmlvciA9IEh5cGVyZ3JpZC5jb25zdHJ1Y3Rvci5iZWhhdmlvcnMuQmVoYXZpb3I7XG4gICAgICAgIEJlaGF2aW9yLnByb3RvdHlwZS5taXhJbihyZXF1aXJlKCcuL21peC1pbnMvYmVoYXZpb3InKSk7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB0b3RhbHNUb29sa2l0O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcblxuICAgIC8qKiBAdHlwZWRlZiB7QXJyYXl9IHZhbHVlTGlzdFxuICAgICAqIEBkZXNjIE9uZSBvZjpcbiAgICAgKiAqIGBhY3RpdmVDb2x1bW5zTGlzdGAgZmFsc3kgLSBBcnJheSBvZiByb3cgdmFsdWVzIHNlbWFudGljYWxseSBjb25ncnVlbnQgdG8gYHRoaXMuY29sdW1uc2AuXG4gICAgICogKiBgYWN0aXZlQ29sdW1uc0xpc3RgIHRydXRoeSAtIEFycmF5IG9mIHJvdyB2YWx1ZXMgc2VtYW50aWNhbGx5IGNvbmdydWVudCB0byBgdGhpcy5hbGxDb2x1bW5zYC5cbiAgICAgKi9cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB4IC0gQ29sdW1uIGluZGV4LiBJZiB5b3UgaGF2ZSBhbiBcImFjdGl2ZVwiIGNvbHVtbiBpbmRleCwgeW91IGNhbiB0cmFuc2xhdGUgaXQgd2l0aCBgdGhpcy5nZXRBY3RpdmVDb2x1bW4oeCkuaW5kZXhgLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gVG90YWxzIHJvdyBpbmRleCwgbG9jYWwgdG8gdGhlIHRvdGFscyBhcmVhLlxuICAgICAqIEBwYXJhbSB2YWx1ZVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfHN0cmluZ1tdfSBbYXJlYXM9Wyd0b3AnLCAnYm90dG9tJ11dIC0gbWF5IGluY2x1ZGUgYCd0b3AnYCBhbmQvb3IgYCdib3R0b20nYFxuICAgICAqIEBtZW1iZXJPZiBCZWhhdmlvci5wcm90b3R5cGVcbiAgICAgKi9cbiAgICBzZXRUb3RhbHNWYWx1ZTogZnVuY3Rpb24oeCwgeSwgdmFsdWUsIGFyZWFzKSB7XG4gICAgICAgIGlmICghYXJlYXMpIHtcbiAgICAgICAgICAgIGFyZWFzID0gW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdWJncmlkcy5sb29rdXAudG9wVG90YWxzKSB7IGFyZWFzLnB1c2goJ3RvcCcpOyB9XG4gICAgICAgICAgICBpZiAodGhpcy5zdWJncmlkcy5sb29rdXAuYm90dG9tVG90YWwpIHsgYXJlYXMucHVzaCgnYm90dG9tJyk7IH1cbiAgICAgICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShhcmVhcykpIHtcbiAgICAgICAgICAgIGFyZWFzID0gW2FyZWFzXTtcbiAgICAgICAgfVxuICAgICAgICBhcmVhcy5mb3JFYWNoKGZ1bmN0aW9uKGFyZWEpIHtcbiAgICAgICAgICAgIHRoaXMuZ2V0VG90YWxzKGFyZWEpW3ldW3hdID0gdmFsdWU7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB0aGlzLmdyaWQuc2V0VG90YWxzVmFsdWVOb3RpZmljYXRpb24oeCwgeSwgdmFsdWUsIGFyZWFzKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHN1bW1hcnkgU2V0IHRoZSB0b3AgdG90YWwgcm93KHMpLlxuICAgICAqIEBwYXJhbSB7dmFsdWVMaXN0W119IFtyb3dzXSAtIEFycmF5IG9mIDAgb3IgbW9yZSByb3dzIGNvbnRhaW5pbmcgc3VtbWFyeSBkYXRhLiBPbWl0IHRvIHNldCB0byBlbXB0eSBhcnJheS5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFthY3RpdmVDb2x1bW5zTGlzdD1mYWxzZV1cbiAgICAgKiBAbWVtYmVyT2YgQmVoYXZpb3IucHJvdG90eXBlXG4gICAgICovXG4gICAgc2V0VG9wVG90YWxzOiBmdW5jdGlvbihyb3dzLCBhY3RpdmVDb2x1bW5zTGlzdCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRUb3RhbHMoJ3RvcCcsIHJvd3MsIGFjdGl2ZUNvbHVtbnNMaXN0KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHN1bW1hcnkgR2V0IHRoZSB0b3AgdG90YWwgcm93KHMpLlxuICAgICAqIEByZXR1cm5zIHt2YWx1ZUxpc3RbXX1cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFthY3RpdmVDb2x1bW5zTGlzdD1mYWxzZV1cbiAgICAgKiBAcmV0dXJucyB7dmFsdWVMaXN0fEFycmF5fSBGdWxsIGRhdGEgcm93IG9iamVjdCwgb3Igb2JqZWN0IGNvbnRhaW5pbmcganVzdCB0aGUgXCJhY3RpdmVcIiBjb2x1bW5zLCBwZXIgYGFjdGl2ZUNvbHVtbnNMaXN0YC5cbiAgICAgKiBAbWVtYmVyT2YgQmVoYXZpb3IucHJvdG90eXBlXG4gICAgICovXG4gICAgZ2V0VG9wVG90YWxzOiBmdW5jdGlvbihhY3RpdmVDb2x1bW5zTGlzdCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRUb3RhbHMoJ3RvcCcsIGFjdGl2ZUNvbHVtbnNMaXN0KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHN1bW1hcnkgU2V0IHRoZSBib3R0b20gdG90YWxzLlxuICAgICAqIEBwYXJhbSB7dmFsdWVMaXN0W119IHJvd3MgLSBBcnJheSBvZiAwIG9yIG1vcmUgcm93cyBjb250YWluaW5nIHN1bW1hcnkgZGF0YS4gT21pdCB0byBzZXQgdG8gZW1wdHkgYXJyYXkuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbYWN0aXZlQ29sdW1uc0xpc3Q9ZmFsc2VdIC0gSWYgYHRydWVgLCBgcm93c2Agb25seSBjb250YWlucyBhY3RpdmUgY29sdW1ucy5cbiAgICAgKiBAbWVtYmVyT2YgQmVoYXZpb3IucHJvdG90eXBlXG4gICAgICovXG4gICAgc2V0Qm90dG9tVG90YWxzOiBmdW5jdGlvbihyb3dzLCBhY3RpdmVDb2x1bW5zTGlzdCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXRUb3RhbHMoJ2JvdHRvbScsIHJvd3MsIGFjdGl2ZUNvbHVtbnNMaXN0KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHN1bW1hcnkgR2V0IHRoZSBib3R0b20gdG90YWwgcm93KHMpLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FjdGl2ZUNvbHVtbnNMaXN0PWZhbHNlXVxuICAgICAqIEByZXR1cm5zIHt2YWx1ZUxpc3R9IEZ1bGwgZGF0YSByb3cgb2JqZWN0LCBvciBvYmplY3QgY29udGFpbmluZyBqdXN0IHRoZSBcImFjdGl2ZVwiIGNvbHVtbnMsIHBlciBgYWN0aXZlQ29sdW1uc0xpc3RgLlxuICAgICAqIEBtZW1iZXJPZiBCZWhhdmlvci5wcm90b3R5cGVcbiAgICAgKi9cbiAgICBnZXRCb3R0b21Ub3RhbHM6IGZ1bmN0aW9uKGFjdGl2ZUNvbHVtbnNMaXN0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFRvdGFscygnYm90dG9tJywgYWN0aXZlQ29sdW1uc0xpc3QpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBrZXlcbiAgICAgKiBAcGFyYW0ge3ZhbHVlTGlzdFtdfSByb3dzXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbYWN0aXZlQ29sdW1uc0xpc3Q9ZmFsc2VdXG4gICAgICogQHJldHVybnMge3ZhbHVlTGlzdFtdfVxuICAgICAqIEByZXR1cm5zIHsqfVxuICAgICAqIEBtZW1iZXJPZiBCZWhhdmlvci5wcm90b3R5cGVcbiAgICAgKi9cbiAgICBzZXRUb3RhbHM6IGZ1bmN0aW9uKGtleSwgcm93cywgYWN0aXZlQ29sdW1uc0xpc3QpIHtcbiAgICAgICAga2V5ICs9ICdUb3RhbHMnO1xuXG4gICAgICAgIHZhciB0b3RhbHMgPSB0aGlzLnN1YmdyaWRzLmxvb2t1cFtrZXldO1xuXG4gICAgICAgIGlmICghdG90YWxzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgdGhpcy5IeXBlcmdyaWRFcnJvcignRXhwZWN0ZWQgc3ViZ3JpZHMuJyArIGtleSArICcuJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocm93cykpIHtcbiAgICAgICAgICAgIC8vIGlmIG5vdCBhbiBhcnJheSwgZmFpbCBzaWxlbnRseVxuICAgICAgICAgICAgcm93cyA9IFtdO1xuICAgICAgICB9IGVsc2UgaWYgKHJvd3MubGVuZ3RoICYmICFBcnJheS5pc0FycmF5KHJvd3NbMF0pKSB7XG4gICAgICAgICAgICAvLyBpZiBhbiB1bm5lc3RlZCBhcnJheSByZXByZXNlbnRpbmcgYSBzaW5nbGUgcm93LCBuZXN0IGl0XG4gICAgICAgICAgICByb3dzID0gW3Jvd3NdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGFjdGl2ZUNvbHVtbnNMaXN0KSB7XG4gICAgICAgICAgICByb3dzLmZvckVhY2goZnVuY3Rpb24ocm93LCBpLCByb3dzKSB7XG4gICAgICAgICAgICAgICAgcm93c1tpXSA9IHRoaXMuZXhwYW5kQWN0aXZlUm93VG9EYXRhUm93KHJvdyk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuZXdSb3dDb3VudCA9IHJvd3MubGVuZ3RoLFxuICAgICAgICAgICAgb2xkUm93Q291bnQgPSB0b3RhbHMuZ2V0Um93Q291bnQoKTtcblxuICAgICAgICB0b3RhbHMuc2V0RGF0YShyb3dzKTtcblxuICAgICAgICBpZiAobmV3Um93Q291bnQgPT09IG9sZFJvd0NvdW50KSB7XG4gICAgICAgICAgICB0aGlzLmdyaWQucmVwYWludCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5ncmlkLmJlaGF2aW9yLnNoYXBlQ2hhbmdlZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJvd3M7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQHBhcmFtIGtleVxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW2FjdGl2ZUNvbHVtbnNMaXN0PWZhbHNlXVxuICAgICAqIEByZXR1cm5zIHt2YWx1ZUxpc3R9IEZ1bGwgZGF0YSByb3cgb2JqZWN0LCBvciBvYmplY3QgY29udGFpbmluZyBqdXN0IHRoZSBcImFjdGl2ZVwiIGNvbHVtbnMsIHBlciBgYWN0aXZlQ29sdW1uc0xpc3RgLlxuICAgICAqIEBtZW1iZXJPZiBCZWhhdmlvci5wcm90b3R5cGVcbiAgICAgKi9cbiAgICBnZXRUb3RhbHM6IGZ1bmN0aW9uKGtleSwgYWN0aXZlQ29sdW1uc0xpc3QpIHtcbiAgICAgICAga2V5ICs9ICdUb3RhbHMnO1xuXG4gICAgICAgIHZhciByb3dzID0gdGhpcy5zdWJncmlkcy5sb29rdXBba2V5XTtcbiAgICAgICAgcm93cyA9IHJvd3MgPyByb3dzLmdldERhdGEoKSA6IFtdO1xuXG4gICAgICAgIGlmIChhY3RpdmVDb2x1bW5zTGlzdCkge1xuICAgICAgICAgICAgcm93cy5mb3JFYWNoKGZ1bmN0aW9uKHJvdywgaSwgcm93cykge1xuICAgICAgICAgICAgICAgIHJvd3NbaV0gPSB0aGlzLmNvbGxhcHNlRGF0YVJvd1RvQWN0aXZlUm93KHJvdyk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByb3dzO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFthY3RpdmVDb2x1bW5zTGlzdD1mYWxzZV1cbiAgICAgKiBAcmV0dXJucyB7dmFsdWVMaXN0fVxuICAgICAqIEBtZW1iZXJPZiBCZWhhdmlvci5wcm90b3R5cGVcbiAgICAgKi9cbiAgICBleHBhbmRBY3RpdmVSb3dUb0RhdGFSb3c6IGZ1bmN0aW9uKGFjdGl2ZUNvbHVtblZhbHVlcykge1xuICAgICAgICB2YXIgZGF0YVJvdyA9IEFycmF5KHRoaXMuYWxsQ29sdW1ucy5sZW5ndGgpO1xuXG4gICAgICAgIHRoaXMuY29sdW1ucy5mb3JFYWNoKGZ1bmN0aW9uKGNvbHVtbiwgaSkge1xuICAgICAgICAgICAgaWYgKGFjdGl2ZUNvbHVtblZhbHVlc1tpXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgZGF0YVJvd1tjb2x1bW4uaW5kZXhdID0gYWN0aXZlQ29sdW1uVmFsdWVzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZGF0YVJvdztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtib29sZWFufSBbYWN0aXZlQ29sdW1uc0xpc3Q9ZmFsc2VdXG4gICAgICogQHJldHVybnMge3ZhbHVlTGlzdH1cbiAgICAgKiBAbWVtYmVyT2YgQmVoYXZpb3IucHJvdG90eXBlXG4gICAgICovXG4gICAgY29sbGFwc2VEYXRhUm93VG9BY3RpdmVSb3c6IGZ1bmN0aW9uKGFsbENvbHVtblZhbHVlcykge1xuICAgICAgICB2YXIgZGF0YVJvdyA9IEFycmF5KHRoaXMuY29sdW1ucy5sZW5ndGgpO1xuXG4gICAgICAgIHRoaXMuY29sdW1ucy5mb3JFYWNoKGZ1bmN0aW9uKGNvbHVtbiwgaSkge1xuICAgICAgICAgICAgaWYgKGFsbENvbHVtblZhbHVlc1tjb2x1bW4uaW5kZXhdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBkYXRhUm93W2ldID0gYWxsQ29sdW1uVmFsdWVzW2NvbHVtbi5pbmRleF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkYXRhUm93O1xuICAgIH1cblxufTtcbiIsIi8qIGVzbGludC1lbnYgYnJvd3NlciAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuXG4gICAgLyoqXG4gICAgICogQG1lbWJlck9mIEh5cGVyZ3JpZC5wcm90b3R5cGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gdG90YWxzIHJvdyBpbmRleCBsb2NhbCB0byB0aGUgdG90YWxzIGFyZWFcbiAgICAgKiBAcGFyYW0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge3N0cmluZ1tdfSBbYXJlYXM9Wyd0b3AnLCAnYm90dG9tJ11dIC0gbWF5IGluY2x1ZGUgYCd0b3AnYCBhbmQvb3IgYCdib3R0b20nYFxuICAgICAqL1xuICAgIHNldFRvdGFsc1ZhbHVlTm90aWZpY2F0aW9uOiBmdW5jdGlvbih4LCB5LCB2YWx1ZSwgYXJlYXMpIHtcbiAgICAgICAgdGhpcy5maXJlU3ludGhldGljU2V0VG90YWxzVmFsdWUoeCwgeSwgdmFsdWUsIGFyZWFzKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQG1lbWJlck9mIEh5cGVyZ3JpZC5wcm90b3R5cGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0geCAtIGNvbHVtbiBpbmRleFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSB5IC0gdG90YWxzIHJvdyBpbmRleCBsb2NhbCB0byB0aGUgdG90YWxzIGFyZWFcbiAgICAgKiBAcGFyYW0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge3N0cmluZ1tdfSBbYXJlYXM9Wyd0b3AnLCAnYm90dG9tJ11dIC0gbWF5IGluY2x1ZGUgYCd0b3AnYCBhbmQvb3IgYCdib3R0b20nYFxuICAgICAqL1xuICAgIGZpcmVTeW50aGV0aWNTZXRUb3RhbHNWYWx1ZTogZnVuY3Rpb24oeCwgeSwgdmFsdWUsIGFyZWFzKSB7XG4gICAgICAgIHZhciBjbGlja0V2ZW50ID0gbmV3IEN1c3RvbUV2ZW50KCdmaW4tc2V0LXRvdGFscy12YWx1ZScsIHtcbiAgICAgICAgICAgIGRldGFpbDoge1xuICAgICAgICAgICAgICAgIHg6IHgsXG4gICAgICAgICAgICAgICAgeTogeSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgYXJlYXM6IGFyZWFzXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNhbnZhcy5kaXNwYXRjaEV2ZW50KGNsaWNrRXZlbnQpO1xuICAgIH1cblxufTtcbiJdfQ==
