'use strict';

var analytics = require('../local_node_modules/finanalytics/analytics');
var DataModel = require('./DataModel');

var JSON = DataModel.extend({

    //null object pattern for the source object
    source: nullDataSource,

    preglobalfilter: nullDataSource,
    prefilter: nullDataSource,

    presorter: nullDataSource,
    analytics: nullDataSource,
    postfilter: nullDataSource,
    postsorter: nullDataSource,

    topTotals: [],

    hasAggregates: function() {
        return this.analytics.hasAggregates();
    },

    hasGroups: function() {
        return this.analytics.hasGroups();
    },

    getDataSource: function() {
        return this.analytics; //this.hasAggregates() ? this.analytics : this.presorter;
    },

    getFilterSource: function() {
        return this.prefilter; //this.hasAggregates() ? this.postfilter : this.prefilter;
    },

    getSortingSource: function() {
        return this.presorter; //this.hasAggregates() ? this.postsorter : this.presorter;
    },

    getValue: function(x, y) {
        var hasHierarchyColumn = this.hasHierarchyColumn();
        var grid = this.getGrid();
        var headerRowCount = grid.getHeaderRowCount();
        var value;
        if (hasHierarchyColumn && x === -2) {
            x = 0;
        }
        if (y < headerRowCount) {
            value = this.getHeaderRowValue(x, y);
            return value;
        }
        if (hasHierarchyColumn) {
            y += 1;
        }
        value = this.getDataSource().getValue(x, y - headerRowCount);
        return value;
    },

    getHeaderRowValue: function(x, y) {
        if (y === undefined) {
            return this.getHeaders()[Math.max(x, 0)];
        }
        var grid = this.getGrid();
        var behavior = grid.getBehavior();
        var isFilterRow = grid.isShowFilterRow();
        var isHeaderRow = grid.isShowHeaderRow();
        var isBoth = isFilterRow && isHeaderRow;
        var topTotalsOffset = (isFilterRow ? 1 : 0) + (isHeaderRow ? 1 : 0);
        if (y >= topTotalsOffset) {
            return this.getTopTotals()[y - topTotalsOffset][x];
        }
        var filter = this.getFilter(x);
        var image = filter.length === 0 ? 'filter-off' : 'filter-on';
        if (isBoth) {
            if (y === 0) {
                image = this.getSortImageForColumn(x);
                return [null, this.getHeaders()[x], image];
            } else {
                return [null, filter, behavior.getImage(image)];
            }
        } else if (isFilterRow) {
            return [null, filter, behavior.getImage(image)];
        } else {
            image = this.getSortImageForColumn(x);
            return [null, this.getHeaders()[x], image];
        }
        return '';
    },

    setValue: function(x, y, value) {
        var hasHierarchyColumn = this.hasHierarchyColumn();
        var grid = this.getGrid();
        var headerRowCount = grid.getHeaderRowCount();
        if (hasHierarchyColumn) {
            if (x === -2) {
                return;
            } else {
                x += 1;
            }
        }
        if (y < headerRowCount) {
            this.setHeaderRowValue(x, y, value);
        } else if (hasHierarchyColumn) {
            y += 1;
        } else {
            this.getDataSource().setValue(x, y - headerRowCount, value);
        }
        this.changed();
    },

    setHeaderRowValue: function(x, y, value) {
        if (value === undefined) {
            return this._setHeader(x, y); // y is really the value
        }
        var grid = this.getGrid();
        var isFilterRow = grid.isShowFilterRow();
        var isHeaderRow = grid.isShowHeaderRow();
        var isBoth = isFilterRow && isHeaderRow;
        var topTotalsOffset = (isFilterRow ? 1 : 0) + (isHeaderRow ? 1 : 0);
        if (y >= topTotalsOffset) {
            this.getTopTotals()[y - topTotalsOffset][x] = value;
        } else if (x === -1) {
            return; // can't change the row numbers
        } else if (isBoth) {
            if (y === 0) {
                return this._setHeader(x, value);
            } else {
                this.setFilter(x, value);
            }
        } else if (isFilterRow) {
            this.setFilter(x, value);
        } else {
            return this._setHeader(x, value);
        }
        return '';
    },

    getColumnProperties: function(x) {
        //access directly because we want it ordered
        var column = this.getBehavior().allColumns[x];
        if (column) {
            return column.getProperties();
        }
        return undefined;
    },

    getFilter: function(x) {
        var columnProperties = this.getColumnProperties(x);
        if (!columnProperties) {
            return '';
        }
        return columnProperties.filter || '';
    },

    setFilter: function(x, value) {
        var columnProperties = this.getColumnProperties(x);
        columnProperties.filter = value;
        this.applyAnalytics();
    },

    getColumnCount: function() {
        return this.analytics.getColumnCount();
    },

    getRowCount: function() {
        var grid = this.getGrid();
        var count = this.getDataSource().getRowCount();
        count += grid.getHeaderRowCount();
        return count;
    },

    getHeaders: function() {
        return this.analytics.getHeaders();
    },

    getDefaultHeaders: function() {},

    setHeaders: function(headers) {
        this.getDataSource().setHeaders(headers);
    },

    setFields: function(fields) {
        this.getDataSource().setFields(fields);
    },

    getFields: function() {
        var fields = this.getDataSource().getFields();
        return fields;
    },

    setData: function(dataRows) {
        this.source = new analytics.JSDataSource(dataRows);
        this.preglobalfilter = new analytics.DataSourceGlobalFilter(this.source);
        this.prefilter = new analytics.DataSourceFilter(this.preglobalfilter);
        this.presorter = new analytics.DataSourceSorterComposite(this.prefilter);
        this.analytics = new analytics.DataSourceAggregator(this.presorter);

        this.applyAnalytics();

        //this.postfilter = new analytics.DataSourceFilter(this.analytics);
        //this.postsorter = new analytics.DataSourceSorterComposite(this.postfilter);
    },

    getTopTotals: function() {
        if (!this.hasAggregates()) {
            return this.topTotals;
        }
        return this.getDataSource().getGrandTotals();
    },

    setTopTotals: function(nestedArray) {
        this.topTotals = nestedArray;
    },

    setGroups: function(groups) {
        this.analytics.setGroupBys(groups);
        this.applyAnalytics();
        this.getGrid().fireSyntheticGroupsChangedEvent(this.getGroups());
    },

    getGroups: function() {
        var headers = this.getHeaders().slice(0);
        var fields = this.getFields().slice(0);
        var groupBys = this.analytics.groupBys;
        var groups = [];
        for (var i = 0; i < groupBys.length; i++) {
            var field = headers[groupBys[i]];
            groups.push({
                id: groupBys[i],
                label: field,
                field: fields
            });
        }
        return groups;
    },

    getAvailableGroups: function() {
        var headers = this.source.getHeaders().slice(0);
        var groupBys = this.analytics.groupBys;
        var groups = [];
        for (var i = 0; i < headers.length; i++) {
            if (groupBys.indexOf(i) === -1) {
                var field = headers[i];
                groups.push({
                    id: i,
                    label: field,
                    field: field
                });
            }
        }
        return groups;
    },

    getVisibleColumns: function() {
        var items = this.getBehavior().columns;
        items = items.filter(function(each) {
            return each.label !== 'Tree';
        });
        return items;
    },

    getHiddenColumns: function() {
        var visible = this.getBehavior().columns;
        var all = this.getBehavior().allColumns;
        var hidden = [];
        for (var i = 0; i < all.length; i++) {
            if (visible.indexOf(all[i]) === -1) {
                hidden.push(all[i]);
            }
        }
        hidden.sort(function(a, b) {
            return a.label < b.label;
        });
        return hidden;
    },

    setAggregates: function(aggregations) {
        this.quietlySetAggregates(aggregations);
        this.applyAnalytics();
    },

    quietlySetAggregates: function(aggregations) {
        this.analytics.setAggregates(aggregations);
    },

    hasHierarchyColumn: function() {
        return this.hasAggregates() && this.hasGroups();
    },

    applyAnalytics: function() {
        this.applyFilters();
        this.applySorts();
        this.applyGroupBysAndAggregations();
    },

    applyGroupBysAndAggregations: function() {
        if (this.analytics.aggregates.length === 0) {
            this.quietlySetAggregates({});
        }
        this.analytics.apply();
    },

    applyFilters: function() {
        this.preglobalfilter.applyFilters();
        var colCount = this.getColumnCount();
        var filterSource = this.getFilterSource();
        var groupOffset = this.hasAggregates() ? 1 : 0;
        filterSource.clearFilters();
        for (var i = 0; i < colCount; i++) {
            var filterText = this.getFilter(i);
            if (filterText.length > 0) {
                filterSource.addFilter(i - groupOffset, textMatchFilter(filterText));
            }
        }
        filterSource.applyFilters();
    },

    toggleSort: function(index, keys) {
        this.incrementSortState(index, keys);
        this.applyAnalytics();
    },

    incrementSortState: function(colIndex, keys) {
        colIndex++; //hack to get around 0 index
        var state = this.getPrivateState();
        var hasCTRL = keys.indexOf('CTRL') > -1;
        state.sorts = state.sorts || [];
        var already = state.sorts.indexOf(colIndex);
        if (already === -1) {
            already = state.sorts.indexOf(-1 * colIndex);
        }
        if (already > -1) {
            if (state.sorts[already] > 0) {
                state.sorts[already] = -1 * state.sorts[already];
            } else {
                state.sorts.splice(already, 1);
            }
        } else if (hasCTRL || state.sorts.length === 0) {
            state.sorts.unshift(colIndex);
        } else {
            state.sorts.length = 0;
            state.sorts.unshift(colIndex);
        }
        if (state.sorts.length > 3) {
            state.sorts.length = 3;
        }
    },

    applySorts: function() {
        var sortingSource = this.getSortingSource();
        var sorts = this.getPrivateState().sorts;
        var groupOffset = this.hasAggregates() ? 1 : 0;
        if (!sorts || sorts.length === 0) {
            sortingSource.clearSorts();
        } else {
            for (var i = 0; i < sorts.length; i++) {
                var colIndex = Math.abs(sorts[i]) - 1;
                var type = sorts[i] < 0 ? -1 : 1;
                sortingSource.sortOn(colIndex - groupOffset, type);
            }
        }
        sortingSource.applySorts();
    },

    getSortImageForColumn: function(index) {
        index++;
        var up = true;
        var sorts = this.getPrivateState().sorts;
        if (!sorts) {
            return null;
        }
        var position = sorts.indexOf(index);
        if (position < 0) {
            position = sorts.indexOf(-1 * index);
            up = false;
        }
        if (position < 0) {
            return null;
        }
        position++;
        var name = (1 + sorts.length - position) + (up ? '-up' : '-down');
        return this.getBehavior().getImage(name);
    },

    cellClicked: function(cell, event) {
        if (!this.hasAggregates()) {
            return;
        }
        if (event.gridCell.x !== 0) {
            return; // this wasn't a click on the hierarchy column
        }
        var grid = this.getGrid();
        var headerRowCount = grid.getHeaderRowCount();
        var y = event.gridCell.y - headerRowCount + 1;
        this.analytics.click(y);
        this.changed();
    },

    getRow: function(y) {
        var grid = this.getGrid();
        var headerRowCount = grid.getHeaderRowCount();
        if (y < headerRowCount && !this.hasAggregates()) {
            var topTotals = this.getTopTotals();
            return topTotals[y - (headerRowCount - topTotals.length)];
        }
        return this.getDataSource().getRow(y - headerRowCount);
    },

    buildRow: function(y) {
        var colCount = this.getColumnCount();
        var fields = [].concat(this.getFields());
        var result = {};
        if (this.hasAggregates()) {
            result.tree = this.getValue(-2, y);
            fields.shift();
        }
        for (var i = 0; i < colCount; i++) {
            result[fields[i]] = this.getValue(i, y);
        }
        return result;
    },

    getComputedRow: function(y) {
        var rcf = this.getRowContextFunction([y]);
        var fields = this.getFields();
        var row = {};
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            row[field] = rcf(field)[0];
        }
        return row;
    },

    getValueByField: function(fieldName, y) {
        var index = this.getFields().indexOf(fieldName);
        if (this.hasAggregates()) {
            y += 1;
        }
        return this.getDataSource().getValue(index, y);
    },

    setGlobalFilter: function(string) {
        if (!string || string.length === 0) {
            this.preglobalfilter.clearFilters();
        } else {
            this.preglobalfilter.setFilter(textMatchFilter(string));
        }
        this.applyAnalytics();
    },

    getCellRenderer: function(config, x, y, untranslatedX, untranslatedY) {
        var renderer;
        var provider = this.getGrid().getCellProvider();

        config.x = x;
        config.y = y;
        config.untranslatedX = untranslatedX;
        config.untranslatedY = untranslatedY;

        renderer = provider.getCell(config);
        renderer.config = config;

        return renderer;
    },

    applyState: function() {
        this.applyAnalytics();
    }

});

var valueOrFunctionExecute = function(valueOrFunction) {
    return typeof valueOrFunction === 'function' ? valueOrFunction() : valueOrFunction;
};

var textMatchFilter = function(string) {
    return function(each) {
        each = valueOrFunctionExecute(each);
        return (each + '').toLowerCase().search(string.toLowerCase()) > -1;
    };
};

var nullDataSource = {
    isNullObject: function() {
        return true;
    },
    getFields: function() {
        return [];
    },
    getHeaders: function() {
        return [];
    },
    getColumnCount: function() {
        return 0;
    },
    getRowCount: function() {
        return 0;
    },
    getGrandTotals: function() {
        return [];
    },
    hasAggregates: function() {
        return false;
    },
    hasGroups: function() {
        return false;
    },
    getRow: function() {
        return null;
    }
};

module.exports = JSON;