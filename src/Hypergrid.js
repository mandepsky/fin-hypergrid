/* eslint-env browser */

'use strict';

var LRUCache = require('lru-cache');
var _ = require('object-iterators');
var Point = require('rectangular').Point;
var Rectangle = require('rectangular').Rectangle;
var FinBar = require('finbars');

var Renderer = require('./Renderer');
var Canvas = require('./local_node_modules/fincanvas/Canvas');
var SelectionModel = require('./SelectionModel');

/**
 *
 * @param {string|Element} div - CSS selector or Element
 * @param {string} behaviorName - name of a behavior consstructor from ./behaviors
 * @constructor
 */
function Hypergrid(div, behaviorName) {

    this.div = typeof div === 'string' ? document.querySelector(div) : div;

    this.behavior = new Hypergrid.behaviors[behaviorName](this);

    if (!propertiesInitialized) {
        propertiesInitialized = true;

        buildPolymerTheme();

        var cellEditors = [
            'Textfield',
            'Choice',
            //'Combo',
            'Color',
            'Date',
            'Slider',
            'Spinner'
        ];

        cellEditors.forEach(function(name) {
            initializeCellEditor(new Hypergrid.cellEditors[name]);
        });
    }

    this.lastEdgeSelection = [0, 0];

    var self = this;

    this.lnfProperties = Object.create(globalProperties);

    this.isWebkit = navigator.userAgent.toLowerCase().indexOf('webkit') > -1;
    this.selectionModel = new SelectionModel();
    this.selectionModel.getGrid = function() {
        return self;
    };
    this.cellEditors = Object.create(globalCellEditors);
    this.renderOverridesCache = {};

    //prevent the default context menu for appearing
    this.oncontextmenu = function(event) {
        event.preventDefault();
        return false;
    };

    this.clearMouseDown();
    this.dragExtent = new Point(0, 0);

    //install any plugins
    this.pluginsDo(function(each) {
        if (each.installOn) {
            each.installOn(self);
        }
    });

    this.numRows = 0;
    this.numColumns = 0;
    //initialize our various pieces
    this.initRenderer();

    this.initCanvas();

    this.initScrollbars();

    this.checkScrollbarVisibility();
    //Register a listener for the copy event so we can copy our selected region to the pastebuffer if conditions are right.
    document.body.addEventListener('copy', function(evt) {
        self.checkClipboardCopy(evt);
    });
    this.getCanvas().resize();
    this.fire('load');
    this.isScrollButtonClick = false;

    //this.computeCellsBounds();
}

Hypergrid.prototype = {
    constructor: Hypergrid.prototype.constructor,

    /**
     *
     * @property {object} behavior - A null object behavior serves as a place holder.
     * @instance
     */
    behavior: null,

    /**
     * @property {boolean} isWebkit - Cached result of if we are running in webkit.
     * @instance
     */
    isWebkit: true,

    /**
     * @property {Point} mouseDown - The pixel location of an initial mousedown click, either for editing a cell or for dragging a selection.
     * @instance
     */
    mouseDown: [],

    /**
     * @property {Point} dragExtent - The extent from the mousedown point during a drag operation.
     * @instance
     */

    dragExtent: null,

    /**
     * @property {number} vScrollValue - A float value between 0.0 - 1.0 of the vertical scroll position.
     * @instance
     */
    vScrollValue: 0,

    /**
     * @property {number} hScrollValue - A float value between 0.0 - 1.0 of the horizontal scroll position.
     * @instance
     */
    hScrollValue: 0,

    /**
     * @property {window.fin.rectangular} rectangular - Namespace for Point and Rectangle "classes" (constructors).
     * @instance
     */
    rectangular: null,

    /**
     * @property {fin-hypergrid-selection-model} selectionModel - A [fin-hypergrid-selection-model](module-._selection-model.html) instance.
     * @instance
     */
    selectionModel: null,

    /**
     * @property {fin-hypergrid-cell-editor} cellEditor - The current instance of [fin-hypergrid-cell-editor](module-cell-editors_base.html).
     * @instance
     */
    cellEditor: null,

    /**
     * @property {boolean} sbMouseIsDown - true if the mouse button is currently down on the scrollbar, this is used to refocus the hypergrid canvas after a scrollbar scroll
     * @instance
     */
    sbMouseIsDown: false,

    /**
     * @property {fin-vampire-bar} sbHScroller - An instance of [fin-vampire-bar](http://datamadic.github.io/fin-vampire-bar/components/fin-vampire-bar/).
     * @instance
     */
    sbHScroller: null,

    /**
     * @property {fin-vampire-bar} sbVScroller - An instance of [fin-vampire-bar](http://datamadic.github.io/fin-vampire-bar/components/fin-vampire-bar/).
     * @instance
     */
    sbVScroller: null,

    /**
     * @property {object} sbHScrollConfig - A config object allow us to dynamically reconfigure the scrollbars, it's properties include rangeStart, rangeStop, step, and page.
     * @instance
     */
    sbHScrollConfig: {},

    /**
     * @property {object} sbVScrollConfig - A config object to allow us to dynamically reconfigure the scrollbars, it's properties include rangeStart, rangeStop, step, and page.
     * @instance
     */
    sbVScrollConfig: {},

    /**
     * @property {number} sbPrevVScrollValue - The previous value of sbVScrollVal.
     * @instance
     */
    sbPrevVScrollValue: null,

    /**
     * @property {number} sbPrevHScrollValue - The previous value of sbHScrollValue.
     * @instance
     */
    sbPrevHScrollValue: null,

    /**
     * @property {object} sbHValueHolder - The listenable scroll model we share with the horizontal scrollbar.
     * @instance
     */

    sbHValueHolder: {},

    /**
     * @property {object} sbVValueHolder - The listenable scroll model we share with the vertical scrollbar.
     * @instance
     */
    sbVValueHolder: {},

    /**
     * @property {object} cellEditors - The cache of singleton cellEditors.
     * @instance
     */
    cellEditors: null,

    /**
     * @property {object} renderOverridesCache - is the short term memory of what column I might be dragging around
     * @instance
     */

    renderOverridesCache: {},

    /**
     * @property {Point} hoverCell - The pixel location of the current hovered cell.
     * @instance
     */
    hoverCell: null,


    /**
     * @property {boolean} isScrollButtonClick - The scroll button was clicked.
     * @instance
     */
    isScrollButtonClick: false,


    scrollingNow: false,

    lastEdgeSelection: null,

    /**
     * @function
     * @instance
    clear out the LRU cache of text widths
     */
    resetTextWidthCache: function() {
        textWidthCache = new LRUCache(2000);
    },

    getProperties: function() {
        return this.getPrivateState();
    },

    _getProperties: function() {
        return this.lnfProperties;
    },

    computeCellsBounds: function() {
        this.getRenderer().computeCellsBounds();
    },

    initializeCellEditor: initializeCellEditor,

    toggleColumnPicker: function() {
        this.getBehavior().toggleColumnPicker();
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The pointer is over the given cell.
     * @param {number} x - The x cell coordinate.
     * @param {number} y - The y cell coordinate.
     */
    isHovered: function(x, y) {
        var p = this.getHoverCell();
        if (!p) {
            return false;
        }
        return p.x === x && p.y === y;
    },

    /**
     * @function
     * @instance
     * @returns boolean} The pointer is hovering over the given column.
     * @param {number} x - The horizontal cell coordinate.
     */
    isColumnHovered: function(x) {
        var p = this.getHoverCell();
        if (!p) {
            return false;
        }
        return p.x === x;
    },

    isRowResizeable: function() {
        return this.resolveProperty('rowResize');
    },

    /**
     *
     *
     * @function
     * @instance
     * @returns {boolean} The pointer is hovering over the row `y`.
     * @param {number} y - The vertical cell coordinate.
     */
    isRowHovered: function(y) {
        var p = this.getHoverCell();
        if (!p) {
            return false;
        }
        return p.y === y;
    },

    /**
     * @function
     * @instance
     * @returns {Point} The cell over which the cursor is hovering.
     */
    getHoverCell: function() {
        return this.hoverCell;
    },


    /**
     * @function
     * @instance
     * @desc Set the cell under the cursor.
     * @param {Point} point
     */
    setHoverCell: function(point) {
        var me = this.hoverCell;
        var newPoint = new Point(point.x, point.y);
        if (me && me.equals(newPoint)) {
            return;
        }
        this.hoverCell = newPoint;
        this.fireSyntheticOnCellEnterEvent(newPoint);
        this.repaint();
    },

    /**
     * @function
     * @instance
     * @desc Ammend properties for all hypergrids in this process.
     * @param {object} properties - A simple properties hash.
     */
    addGlobalProperties: function(properties) {
        //we check for existence to avoid race condition in initialization
        if (!globalProperties) {
            var self = this;
            setTimeout(function() {
                self.addGlobalProperties(properties);
            }, 10);
        } else {
            this._addGlobalProperties(properties);
        }

    },

    /**
     * @function
     * @instance
     * @desc Ammend properties for all hypergrids in this process.
     * @param {object} properties - A simple properties hash.
     * @private
     */
    _addGlobalProperties: function(properties) {
        _(properties).each(function(property, key) {
            globalProperties[key] = property;
        });
    },

    /**
     * @function
     * @instance
     * @desc Ammend properties for this hypergrid only.
     * @param {object} properties - A simple properties hash.
     */
    addProperties: function(moreProperties) {
        var properties = this.getProperties();
        _(moreProperties).each(function(property, key) {
            properties[key] = moreProperties[key];
        });
        this.refreshProperties();
    },

    /**
     * @function
     * @instance
     * @desc Utility function to push out properties if we change them.
     * @param {object} properties - An object of various key value pairs.
     */

    refreshProperties: function() {
        // this.canvas = this.shadowRoot.querySelector('fin-canvas');
        var div = this.shadowRoot.querySelector('#fincanvas'); //TODO: can't be using document here!
        this.canvas = new Canvas(div, this.renderer);
        this.checkScrollbarVisibility();
        this.getBehavior().defaultRowHeight = null;
        if (this.isColumnAutosizing()) {
            this.getBehavior().autosizeAllColumns();
        }
    },

    /**
     * @function
     * @instance
     * @returns {object} The state object for remembering our state.
     * @see [Memento pattern](http://en.wikipedia.org/wiki/Memento_pattern)
     */
    getPrivateState: function() {
        return this.getBehavior().getPrivateState();
    },

    /**
     * @function
     * @instance
     * @desc Set the state object to return to the given user configuration.
     * @param {object} state - A memento object.
     * @see [Memento pattern](http://en.wikipedia.org/wiki/Memento_pattern)
     */
    setState: function(state) {
        var self = this;
        this.getBehavior().setState(state);
        setTimeout(function() {
            self.behaviorChanged();
            self.synchronizeScrollingBoundries();
        }, 100);
    },

    getState: function() {
        return this.getBehavior().getState();
    },
    /**
     * @function
     * @instance
     * @returns {object} The initial mouse position on a mouse down event for cell editing or a drag operation.
     * @instance
     */
    getMouseDown: function() {
        var last = this.mouseDown.length - 1;
        if (last < 0) {
            return null;
        }
        return this.mouseDown[last];
    },

    /**
     * @function
     * @instance
     * @desc Remove the last item from the mouse down stack.
     */
    popMouseDown: function() {
        if (this.mouseDown.length === 0) {
            return;
        }
        this.mouseDown.length = this.mouseDown.length - 1;
    },

    /**
     * @function
     * @instance
     * @desc Empty out the mouse down stack.
     */
    clearMouseDown: function() {
        this.mouseDown = [new Point(-1, -1)];
        this.dragExtent = null;
    },

    /**
     * @function
     * @instance
     set the mouse point that initated a cell edit or drag operation
     *
     * @param {Point} point
     */
    setMouseDown: function(point) {
        this.mouseDown.push(point);
    },

    /**
     * @function
     * @instance
     * @returns {Point} The extent point of the current drag selection rectangle.
     */
    getDragExtent: function() {
        return this.dragExtent;
    },

    /**
     * @function
     * @instance
     * @summary Sets the extent point of the current drag selection operation.
     * @param {Point} point
     */
    setDragExtent: function(point) {
        this.dragExtent = point;
    },

    /**
     * @function
     * @instance Iterate over the plugins invoking the given function with each.
     * @param {function} func - The function to invoke on all the plugins.
     */
    pluginsDo: function(func) {
        //TODO: We need a new plugin mechanism!
        //var userPlugins = this.children.array();
        //var pluginsTag = this.shadowRoot.querySelector('fin-plugins');
        //
        //var plugins = userPlugins;
        //if (pluginsTag) {
        //    var systemPlugins = pluginsTag.children.array();
        //    plugins = systemPlugins.concat(plugins);
        //}
        //
        //plugins.forEach(function(plugin) {
        //    func(plugin);
        //});
    },

    /**
     * @function
     * @instance
     * @desc The CellProvider is accessed through Hypergrid because Hypergrid is the mediator and should have ultimate control on where it comes from. The default is to delegate through the behavior object.
     * @returns {fin-hypergrid-cell-provider}
     */
    getCellProvider: function() {
        var provider = this.getBehavior().getCellProvider();
        return provider;
    },

    /**
     * @function
     * @instance
     * @desc This function is a callback from the HypergridRenderer sub-component. It is called after each paint of the canvas.
     */
    gridRenderedNotification: function() {
        this.updateRenderedSizes();
        if (this.cellEditor) {
            this.cellEditor.gridRenderedNotification();
        }
        this.checkColumnAutosizing();
        this.fireSyntheticGridRenderedEvent();
    },

    /**
     * @function
     * @instance
     * @desc The grid has just been rendered, make sure the column widths are optimal.
     */
    checkColumnAutosizing: function() {
        var behavior = this.getBehavior();
        behavior.autoSizeRowNumberColumn();
        if (this.isColumnAutosizing()) {
            behavior.checkColumnAutosizing(false);
        }
    },
    /**
     * @function
     * @instance
     * @desc Notify the GridBehavior how many rows and columns we just rendered.
     */
    updateRenderedSizes: function() {
        var behavior = this.getBehavior();
        //add one to each of these values as we want also to include
        //the columns and rows that are partially visible
        behavior.setRenderedColumnCount(this.getVisibleColumns() + 1);
        behavior.setRenderedRowCount(this.getVisibleRows() + 1);
    },

    /**
     * @function
     * @instance
     * @summary Conditionally copy to clipboard.
     * @desc If we have focus, copy our current selection data to the system clipboard.
     * @param {event} event - The copy system event.
     */
    checkClipboardCopy: function(event) {
        if (!this.hasFocus()) {
            return;
        }
        event.preventDefault();
        var csvData = this.getSelectionAsTSV();
        event.clipboardData.setData('text/plain', csvData);
    },

    /**
     * @function
     * @instance
     * @returns {boolean} We have any selections.
     */
    hasSelections: function() {
        if (!this.getSelectionModel) {
            return; // were not fully initialized yet
        }
        return this.getSelectionModel().hasSelections();
    },

    /**
     * @function
     * @instance
     * @returns {string} Tab separated value string from the selection and our data.
     */
    getSelectionAsTSV: function() {
        var sm = this.getSelectionModel();
        if (sm.hasSelections()) {
            var selections = this.getSelectionMatrix();
            selections = selections[selections.length - 1];
            return this.getMatrixSelectionAsTSV(selections);
        } else if (sm.hasRowSelections()) {
            return this.getMatrixSelectionAsTSV(this.getRowSelectionMatrix());
        } else if (sm.hasColumnSelections()) {
            return this.getMatrixSelectionAsTSV(this.getColumnSelectionMatrix());
        }
    },

    getMatrixSelectionAsTSV: function(selections) {
        //only use the data from the last selection
        if (selections.length) {
            var width = selections.length,
                height = selections[0].length,
                area = width * height,
                collector = [];

            //disallow if selection is too big
            if (area > 20000) {
                alert('selection size is too big to copy to the paste buffer'); // eslint-disable-line no-alert
                return '';
            }

            var collectCells = function(selectionCell, x) {
                collector.push(selectionCell);
                if (x < width) {
                    collector.push('\t');
                }
            };

            var collectRows = function(selectionRow, y) {
                selectionRow.forEach(collectCells);
                if (y < height) {
                    collector.push('\n');
                }
            };

            selections.forEach(collectRows);

            return collector.join('');
        }
    },

    /**
     * @function
     * @instance
     * @returns {boolean} We have focus.
     */
    hasFocus: function() {
        return this.getCanvas().hasFocus();
    },

    /**
     * @function
     * @instance
     * @desc Clear all the selections.
     */
    clearSelections: function() {
        this.getSelectionModel().clear();
        this.clearMouseDown();
    },

    /**
     * @function
     * @instance
     * @desc Clear the most recent selection.
     */
    clearMostRecentSelection: function() {
        this.getSelectionModel().clearMostRecentSelection();
    },

    /**
     * @function
     * @instance
     * @desc Clear the most recent column selection.
     */
    clearMostRecentColumnSelection: function() {
        this.getSelectionModel().clearMostRecentColumnSelection();
    },

    /**
     * @function
     * @instance
     * @desc Clear the most recent row selection.
     */
    clearMostRecentRowSelection: function() {
        this.getSelectionModel().clearMostRecentRowSelection();
    },

    /**
     * @function
     * @instance
     * @summary Select given region.
     * @param {number} ox - origin x
     * @param {number} oy - origin y
     * @param {number} ex - extent x
     * @param {number} ex - extent y
     */
    select: function(ox, oy, ex, ey) {
        if (ox < 0 || oy < 0) {
            //we don't select negative area
            //also this means there is no origin mouse down for a selection rect
            return;
        }
        this.getSelectionModel().select(ox, oy, ex, ey);
    },

    /**
     * @function
     * @instance
     * @returns {boolean} Given point is selected.
     * @param {number} x - The horizontal coordinate.
     * @param {number} y - The vertical coordinate.
     */
    isSelected: function(x, y) {
        return this.getSelectionModel().isSelected(x, y);
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The given column is selected anywhere in the entire table.
     * @param {number} col - The column index.
     */
    isCellSelectedInRow: function(col) {
        var selectionModel = this.getSelectionModel();
        var isSelected = selectionModel.isCellSelectedInRow(col);
        return isSelected;
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The given row is selected anywhere in the entire table.
     * @param {number} row - The row index.
     */
    isCellSelectedInColumn: function(row) {
        var selectionModel = this.getSelectionModel();
        var isSelected = selectionModel.isCellSelectedInColumn(row);
        return isSelected;
    },

    /**
     * @function
     * @instance
     * @returns {fin-hypergrid-selection-model} The selection model.
     */
    getSelectionModel: function() {
        return this.selectionModel;
    },

    /**
     * @function
     * @instance
     * @returns {fin-hypergrid-behavior-base} The behavior (model).
     */
    getBehavior: function() {
        return this.behavior;
    },

    /**
     * @function
     * @instance
     * @summary Set the Behavior (model) object for this grid control.
     * @desc This can be done dynamically.
     * @param {fin-hypergrid-behavior-base} newBehavior - see [fin-hypergrid-behavior-base](module-behaviors_base.html)
     */
    setBehavior: function(newBehavior) {

        this.behavior = newBehavior;
        this.behavior.setGrid(this);

        this.behavior.changed = this.behaviorChanged.bind(this);
        this.behavior.shapeChanged = this.behaviorShapeChanged.bind(this);
        this.behavior.stateChanged = this.behaviorStateChanged.bind(this);
    },

    /**
     * @function
     * @instance
     * @desc I've been notified that the behavior has changed.
     */
    behaviorChanged: function() {
        if (this.numColumns !== this.getColumnCount() || this.numRows !== this.getRowCount()) {
            this.numColumns = this.getColumnCount();
            this.numRows = this.getRowCount();
            this.behaviorShapeChanged();
        }
        this.computeCellsBounds();
        this.repaint();
    },

    /**
     * @function
     * @instance
     * @returns {Rectangle} My bounds.
     */
    getBounds: function() {
        var canvas = this.getCanvas();
        if (canvas) {
            return canvas.getBounds();
        } else {
            return null;
        }
    },

    /**
     * @function
     * @instance
     * @returns {string} The value of a lnf property.
     * @param {string} key - A look-and-feel key.
     */
    resolveProperty: function(key) {
        return this.getProperties()[key];
    },

    /**
     * @function
     * @instance
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    behaviorShapeChanged: function() {
        this.synchronizeScrollingBoundries();
    },

    /**
     * @function
     * @instance
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    behaviorStateChanged: function() {
        this.getRenderer().computeCellsBounds();
        this.repaint();
    },

    repaint: function() {
        var now = this.resolveProperty('repaintImmediately');
        var canvas = this.getCanvas();
        if (canvas) {
            if (now === true) {
                canvas.paintNow();
            } else {
                canvas.repaint();
            }
        }
    },

    /**
     * @function
     * @instance
     * @desc Paint immediately in this microtask.
     */
    paintNow: function() {
        var canvas = this.getCanvas();
        canvas.paintNow();
    },

    /**
     * @function
     * @instance
     * @returns {boolean} In HiDPI mode (has an attribute as such).
     */
    useHiDPI: function() {
        return this.resolveProperty('useHiDPI') !== false;
    },

    /**
     * @function
     * @instance
     * @summary Initialize drawing surface.
     * @private
     */
    initCanvas: function() {

        var self = this;

        this.canvas = new Canvas(this.div, this.renderer);

        //this.shadowRoot.appendChild(domCanvas);

        //this.canvas = this.shadowRoot.querySelector('fin-canvas');

        var style = this.div.style;
        style.position = 'absolute';
        style.top = 0;
        style.right = '-200px';
        //leave room for the vertical scrollbar
        //style.marginRight = '15px';
        style.bottom = 0;
        //leave room for the horizontal scrollbar
        //style.marginBottom = '15px';
        style.left = 0;

        this.canvas.resizeNotification = function() {
            self.resized();
        };

        this.addFinEventListener('fin-canvas-mousemove', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e;
            self.delegateMouseMove(mouseEvent);
        });

        this.addFinEventListener('fin-canvas-mousedown', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            //self.stopEditing();
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.keys = e.detail.keys;
            mouseEvent.primitiveEvent = e;
            self.mouseDownState = mouseEvent;
            self.delegateMouseDown(mouseEvent);
            self.fireSyntheticMouseDownEvent(mouseEvent);
            self.repaint();
        });


        // this.addFinEventListener('fin-canvas-click', function(e) {
        //     if (self.resolveProperty('readOnly')) {
        //         return;
        //     }
        //     //self.stopEditing();
        //     var mouse = e.detail.mouse;
        //     var mouseEvent = self.getGridCellFromMousePoint(mouse);
        //     mouseEvent.primitiveEvent = e;
        //     self.fireSyntheticClickEvent(mouseEvent);
        // });

        this.addFinEventListener('fin-canvas-mouseup', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            self.dragging = false;
            if (self.isScrollingNow()) {
                self.setScrollingNow(false);
            }
            if (self.columnDragAutoScrolling) {
                self.columnDragAutoScrolling = false;
            }
            //self.stopEditing();
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e;
            self.delegateMouseUp(mouseEvent);
            if (self.mouseDownState) {
                self.fireSyntheticButtonPressedEvent(self.mouseDownState);
            }
            self.mouseDownState = null;
            self.fireSyntheticMouseUpEvent(mouseEvent);
        });

        this.addFinEventListener('fin-canvas-tap', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            //self.stopEditing();
            var mouse = e.detail.mouse;
            var tapEvent = self.getGridCellFromMousePoint(mouse);
            tapEvent.primitiveEvent = e;
            tapEvent.keys = e.detail.keys;
            self.fireSyntheticClickEvent(tapEvent);
            self.delegateTap(tapEvent);
        });

        this.addFinEventListener('fin-canvas-drag', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            self.dragging = true;
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e;
            self.delegateMouseDrag(mouseEvent);
        });

        this.addFinEventListener('fin-canvas-keydown', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            self.fireSyntheticKeydownEvent(e);
            self.delegateKeyDown(e);
        });

        this.addFinEventListener('fin-canvas-keyup', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            self.fireSyntheticKeyupEvent(e);
            self.delegateKeyUp(e);
        });

        this.addFinEventListener('fin-canvas-track', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            if (self.dragging) {
                return;
            }
            var primEvent = e.detail.primitiveEvent;
            if (Math.abs(primEvent.dy) > Math.abs(primEvent.dx)) {
                if (primEvent.yDirection > 0) {
                    self.scrollVBy(-2);
                } else if (primEvent.yDirection < -0) {
                    self.scrollVBy(2);
                }
            } else {
                if (primEvent.xDirection > 0) {
                    self.scrollHBy(-1);
                } else if (primEvent.xDirection < -0) {
                    self.scrollHBy(1);
                }
            }
        });

        // this.addFinEventListener('fin-canvas-holdpulse', function(e) {
        //     console.log('holdpulse');
        //     if (self.resolveProperty('readOnly')) {
        //         return;
        //     }
        //     var mouse = e.detail.mouse;
        //     var mouseEvent = self.getGridCellFromMousePoint(mouse);
        //     mouseEvent.primitiveEvent = e;
        //     self.delegateHoldPulse(mouseEvent);
        // });

        this.addFinEventListener('fin-canvas-dblclick', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e;
            self.fireSyntheticDoubleClickEvent(mouseEvent, e);
            self.delegateDoubleClick(mouseEvent);
        });

        this.addFinEventListener('fin-canvas-wheelmoved', function(e) {
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e.detail.primitiveEvent;
            self.delegateWheelMoved(mouseEvent);
        });

        this.addFinEventListener('fin-canvas-mouseout', function(e) {
            if (self.resolveProperty('readOnly')) {
                return;
            }
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e.detail.primitiveEvent;
            self.delegateMouseExit(mouseEvent);
        });


        this.addFinEventListener('fin-canvas-context-menu', function(e) {
            var mouse = e.detail.mouse;
            var mouseEvent = self.getGridCellFromMousePoint(mouse);
            mouseEvent.primitiveEvent = e.detail.primitiveEvent;
            self.delegateContextMenu(mouseEvent);
        });

        this.removeAttribute('tabindex');

    },

    convertViewPointToDataPoint: function(viewPoint) {
        return this.getBehavior().convertViewPointToDataPoint(viewPoint);
    },

    convertDataPointToViewPoint: function(dataPoint) {
        return this.getBehavior().convertDataPointToViewPoint(dataPoint);
    },

    /**
     * @function
     * @instance
     * @summary Add an event listener to me.
     * @param {string} eventName - The type of event we are interested in.
     * @param {function} callback - The event handler.
     */
    addFinEventListener: function(eventName, callback) {
        this.canvas.addEventListener(eventName, callback);
    },

    /**
     * @function
     * @instance
     * @summary Set for `scrollingNow` field.
     * @param {boolean} isItNow - The type of event we are interested in.
     */
    setScrollingNow: function(isItNow) {
        this.scrollingNow = isItNow;
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The `scrollingNow` field.
     */
    isScrollingNow: function() {
        return this.scrollingNow;
    },

    /**
     * @function
     * @instance
     * @returns {number} The index of the column divider under the mouse coordinates.
     * @param {MouseEvent} mouseEvent - The event to interogate.
     */
    overColumnDivider: function(mouseEvent) {
        var x = mouseEvent.primitiveEvent.detail.mouse.x;
        var whichCol = this.getRenderer().overColumnDivider(x);
        return whichCol;
    },

    /**
     * @function
     * @instance
     * @returns {number} The index of the row divider under the mouse coordinates.
     * @param {MouseEvent} mouseEvent - The event to interogate.
     */
    overRowDivider: function(mouseEvent) {
        var y = mouseEvent.primitiveEvent.detail.mouse.y;
        var which = this.getRenderer().overRowDivider(y);
        return which;
    },

    /**
     * @function
     * @instance
     * @desc Switch the cursor for the grid.
     * @param {string} cursorName - A well know cursor name.
     * @see [cursor names](http://www.javascripter.net/faq/stylesc.htm)
     */
    beCursor: function(cursorName) {
        this.style.cursor = cursorName;
    },

    /**
     * @function
     * @instance
     * @desc Delegate the wheel moved event to the behavior.
     * @param {Event} event - The pertinent event.
     */
    delegateWheelMoved: function(event) {
        var behavior = this.getBehavior();
        behavior.onWheelMoved(this, event);
    },

    /**
     * @function
     * @instance
     * @desc Delegate MouseExit to the behavior (model).
     * @param {Event} event - The pertinent event.
     */
    delegateMouseExit: function(event) {
        var behavior = this.getBehavior();
        behavior.handleMouseExit(this, event);
    },

    /**
     * @function
     * @instance
     * @desc Delegate MouseExit to the behavior (model).
     * @param {Event} event - The pertinent event.
     */
    delegateContextMenu: function(event) {
        var behavior = this.getBehavior();
        behavior.onContextMenu(this, event);
    },

    /**
     * @function
     * @instance
     * @desc Delegate MouseMove to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseMove: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.onMouseMove(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @desc Delegate mousedown to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseDown: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.handleMouseDown(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @desc Delegate mouseup to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseUp: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.onMouseUp(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @desc Delegate tap to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateTap: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.onTap(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @desc Delegate mouseDrag to the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateMouseDrag: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.onMouseDrag(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @desc We've been doubleclicked on. Delegate through the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateDoubleClick: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.onDoubleClick(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @desc Delegate holdpulse through the behavior (model).
     * @param {mouseDetails} mouseDetails - An enriched mouse event from fin-canvas.
     */
    delegateHoldPulse: function(mouseDetails) {
        var behavior = this.getBehavior();
        behavior.onHoldPulse(this, mouseDetails);
    },

    /**
     * @function
     * @instance
     * @summary Generate a function name and call it on self.
     * @desc This should also be delegated through Behavior keeping the default implementation here though.
     * @param {event} event - The pertinent event.
     */
    delegateKeyDown: function(event) {
        var behavior = this.getBehavior();
        behavior.onKeyDown(this, event);
    },

    /**
     * @function
     * @instance
     * @summary Generate a function name and call it on self.
     * @desc This should also be delegated through Behavior keeping the default implementation here though.
     * @param {event} event - The pertinent event.
     */
    delegateKeyUp: function(event) {
        var behavior = this.getBehavior();
        behavior.onKeyUp(this, event);
    },

    /**
     * @function
     * @instance
     * @summary Shut down the current cell editor.
     */
    stopEditing: function() {
        if (this.cellEditor) {
            if (this.cellEditor.stopEditing) {
                this.cellEditor.stopEditing();
            }
            this.cellEditor = null;
        }
    },

    /**
     * @function
     * @instance
     * @summary Register a cell editor.
     * @desc This is typically called from within a cell-editor's `installOn` method, when it is being initialized as a plugin.
     * @param {string} alias - The name/id of the cell editor.
     * @param {fin-hypergrid-cell-editor-base} cellEditor - see [fin-hypergrid-cell-editor-base](module-cell-editors_base.html)
     */
    registerCellEditor: function(alias, cellEditor) {
        this.cellEditors[alias] = cellEditor;
    },

    /**
     * @function
     * @instance
     * @returns {Rectangle} The pixel coordinates of just the center 'main" data area.
     */
    getDataBounds: function() {
        var colDNDHackWidth = 200; //this was a hack to help with column dnd, need to factor this into a shared variable
        //var behavior = this.getBehavior();
        var b = this.canvas.bounds;

        //var x = this.getRowNumbersWidth();
        // var y = behavior.getFixedRowsHeight() + 2;

        var result = new Rectangle(0, 0, b.origin.x + b.extent.x - colDNDHackWidth, b.origin.y + b.extent.y);
        return result;
    },

    getRowNumbersWidth: function() {
        if (this.isShowRowNumbers()) {
            return this.getRenderer().getRowNumbersWidth();
        } else {
            return 0;
        }
    },

    /**
     * @function
     * @instance
     * @returns {fin-canvas} Our fin-canvas instance.
     */
    getCanvas: function() {
        return this.canvas;
    },

    /**
     * @function
     * @instance
     * @summary Open the given cell-editor at the provided model coordinates.
     * @param {string} cellEditor - The specific cell editor to use.
     * @param {Point} coordinates - The pixel locaiton of the cell to edit at.
     */
    editAt: function(cellEditor, coordinates) {

        this.cellEditor = cellEditor;

        var cell = coordinates.gridCell;

        var x = cell.x;
        var y = cell.y;

        if (x < 0 || y < 0) {
            return;
        }

        var editPoint = new Point(x, y);
        this.setMouseDown(editPoint);
        this.setDragExtent(new Point(0, 0));

        if (!cellEditor.isAdded) {
            cellEditor.isAdded = true;
            this.shadowRoot.appendChild(cellEditor.getInput());
        }
        cellEditor.grid = this;
        cellEditor.beginEditAt(editPoint);
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The given column is fully visible.
     * @param {number} columnIndex - The column index in question.
     */
    isColumnVisible: function(columnIndex) {
        var isVisible = this.getRenderer().isColumnVisible(columnIndex);
        return isVisible;
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The given row is fully visible.
     * @param {number} rowIndex - The row index in question.
     */
    isDataRowVisible: function(rowIndex) {
        var isVisible = this.getRenderer().isRowVisible(rowIndex);
        return isVisible;
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The given cell is fully is visible.
     * @param {number} columnIndex - The column index in question.
     * @param {number} rowIndex - The row index in question.
     */
    isDataVisible: function(columnIndex, rowIndex) {
        var isVisible = this.isDataRowVisible(rowIndex) && this.isColumnVisible(columnIndex);
        return isVisible;
    },

    /**
     * @function
     * @instance
     * @summary Scroll in the `offsetX` direction if column index `colIndex` is not visible.
     * @param {number} colIndex - The column index in question.
     * @param {number} offsetX - The direction and magnitude to scroll if we need to.
     */
    insureModelColIsVisible: function(colIndex, offsetX) {
        //-1 because we want only fully visible columns, don't include partially
        //visible columns
        var maxCols = this.getColumnCount() - 1;
        var indexToCheck = colIndex;

        if (offsetX > 0) {
            indexToCheck++;
        }

        if (!this.isColumnVisible(indexToCheck) || colIndex === maxCols) {
            //the scroll position is the leftmost column {
            this.scrollBy(offsetX, 0);
            return true;
        }
        return false;
    },

    /**
     * @function
     * @instance
     * @summary Scroll in the offsetY direction if column index c is not visible.
     * @param {number} rowIndex - The column index in question.
     * @param {number} offsetX - The direction and magnitude to scroll if we need to.
     */
    insureModelRowIsVisible: function(rowIndex, offsetY) {
        //-1 because we want only fully visible rows, don't include partially
        //viewable rows
        var maxRows = this.getRowCount() - 1;
        var indexToCheck = rowIndex;

        if (offsetY > 0) {
            indexToCheck++;
        }

        if (!this.isDataRowVisible(indexToCheck) || rowIndex === maxRows) {
            //the scroll position is the topmost row
            this.scrollBy(0, offsetY);
            return true;
        }
        return false;
    },

    /**
     * @function
     * @instance
     * @summary Scroll horizontal and vertically by the provided offsets.
     * @param {number} offsetX - Scroll in the x direction this much.
     * @param {number} offsetY - Scroll in the y direction this much.
     */
    scrollBy: function(offsetX, offsetY) {
        this.scrollHBy(offsetX);
        this.scrollVBy(offsetY);
    },

    /**
     * @function
     * @instance
     * @summary Scroll vertically by the provided offset.
     * @param {number} offsetY - Scroll in the y direction this much.
     */
    scrollVBy: function(offsetY) {
        var max = this.sbVScroller.range.max;
        var oldValue = this.getVScrollValue();
        var newValue = Math.min(max, Math.max(0, oldValue + offsetY));
        if (newValue === oldValue) {
            return;
        }
        this.setVScrollValue(newValue);
    },

    /**
     * @function
     * @instance
     * @summary Scroll horizontally by the provided offset.
     * @param {number} offsetX - Scroll in the x direction this much.
     */
    scrollHBy: function(offsetX) {
        var max = this.sbHScroller.range.max;
        var oldValue = this.getHScrollValue();
        var newValue = Math.min(max, Math.max(0, oldValue + offsetX));
        if (newValue === oldValue) {
            return;
        }
        this.setHScrollValue(newValue);
    },

    /**
     * @function
     * @instance
     * @summary Answer which data cell is under a pixel value mouse point.
     * @param {mousePoint} mouse - The mouse point to interrogate.
     */

    getGridCellFromMousePoint: function(mouse) {
        var cell = this.getRenderer().getGridCellFromMousePoint(mouse);
        return cell;
    },

    /**
     * @function
     * @returns {Rectangle} The pixel based bounds rectangle given a data cell point.
     * @param {Point} cell - The pixel location of the mouse.
     * @instance
     */
    getBoundsOfCell: function(cell) {
        var b = this.getRenderer().getBoundsOfCell(cell);

        //we need to convert this to a proper rectangle
        var newBounds = new Rectangle(b.x, b.y, b.width, b.height);
        return newBounds;
    },

    /**
     * @function
     * @instance
     * @desc This is called by the fin-canvas when a resize occurs.
     */
    resized: function() {
        this.synchronizeScrollingBoundries();
    },

    /**
     * @function
     * @instance
     * @summary A click event occured.
     * @desc Determine the cell and delegate to the behavior (model).
     * @param {MouseEvent} event - The mouse event to interogate.
     */
    cellClicked: function(event) {
        var cell = event.gridCell;
        var colCount = this.getColumnCount();
        var rowCount = this.getRowCount();

        //click occured in background area
        if (cell.x > colCount || cell.y > rowCount) {
            return;
        }

        //var behavior = this.getBehavior();
        var hovered = this.getHoverCell();
        var sy = this.getVScrollValue();
        var x = hovered.x;
        // if (hovered.x > -1) {
        //     x = behavior.translateColumnIndex(hovered.x + this.getHScrollValue());
        // }
        if (hovered.y < 0) {
            sy = 0;
        }
        hovered = new Point(x, hovered.y + sy);
        this.getBehavior().cellClicked(hovered, event);
    },

    setTotalsValueNotification: function(x, y, value) {
        this.fireSyntheticSetTotalsValue(x, y, value);
    },

    fireSyntheticSetTotalsValue: function(x, y, value) {
        var clickEvent = new CustomEvent('fin-set-totals-value', {
            detail: {
                x: x,
                y: y,
                value: value
            }
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    fireSyntheticEditorKeyUpEvent: function(inputControl, keyEvent) {
        var clickEvent = new CustomEvent('fin-editor-key-up', {
            detail: {
                input: inputControl,
                keyEvent: keyEvent
            },

        });
        this.canvas.dispatchEvent(clickEvent);
    },

    fireSyntheticEditorKeyDownEvent: function(inputControl, keyEvent) {
        var clickEvent = new CustomEvent('fin-editor-key-down', {
            detail: {
                input: inputControl,
                keyEvent: keyEvent
            },

        });
        this.canvas.dispatchEvent(clickEvent);
    },

    fireSyntheticEditorKeyPressEvent: function(inputControl, keyEvent) {
        var clickEvent = new CustomEvent('fin-editor-key-press', {
            detail: {
                input: inputControl,
                keyEvent: keyEvent
            },

        });
        this.canvas.dispatchEvent(clickEvent);
    },

    fireSyntheticEditorDataChangeEvent: function(inputControl, oldValue, newValue) {
        var clickEvent = new CustomEvent('fin-editor-data-change', {
            detail: {
                input: inputControl,
                oldValue: oldValue,
                newValue: newValue
            },
            cancelable: true
        });
        return this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-row-selection-changed` event.
     */
    fireSyntheticRowSelectionChangedEvent: function() {
        var selectionEvent = new CustomEvent('fin-row-selection-changed', {
            detail: {
                rows: this.getSelectedRows(),
                columns: this.getSelectedColumns(),
                selections: this.getSelectionModel().getSelections(),
            }
        });
        this.canvas.dispatchEvent(selectionEvent);
    },

    fireSyntheticColumnSelectionChangedEvent: function() {
        var selectionEvent = new CustomEvent('fin-column-selection-changed', {
            detail: {
                rows: this.getSelectedRows(),
                columns: this.getSelectedColumns(),
                selections: this.getSelectionModel().getSelections()
            }
        });
        this.canvas.dispatchEvent(selectionEvent);
    },
    /**
     * @function
     * @instance
     * @desc Synthesize and dispatch a `fin-selection-changed` event.
     */
    selectionChanged: function() {
        var selectedRows = this.getSelectedRows();
        var selectionEvent = new CustomEvent('fin-selection-changed', {
            detail: {
                rows: selectedRows,
                columns: this.getSelectedColumns(),
                selections: this.getSelectionModel().getSelections(),
            }
        });
        this.canvas.dispatchEvent(selectionEvent);
    },


    getRowSelection: function() {
        var c, column, self = this,
            selectedRowIndexes = this.getSelectionModel().getSelectedRows(),
            numCols = this.getColumnCount(),
            result = {};

        function setValue(selectedRowIndex, r) {
            column[r] = valueOrFunctionExecute(self.getValue(c, selectedRowIndex));
        }

        for (c = 0; c < numCols; c++) {
            column = new Array(selectedRowIndexes.length);
            result[this.getField(c)] = column;
            selectedRowIndexes.forEach(setValue);
        }

        return result;
    },

    getRowSelectionMatrix: function() {
        var c, self = this,
            selectedRowIndexes = this.getSelectionModel().getSelectedRows(),
            numCols = this.getColumnCount(),
            result = new Array(numCols);

        function getValue(selectedRowIndex, r) {
            result[c][r] = valueOrFunctionExecute(self.getValue(c, selectedRowIndex));
        }

        for (c = 0; c < numCols; c++) {
            result[c] = new Array(selectedRowIndexes.length);
            selectedRowIndexes.forEach(getValue);
        }

        return result;
    },

    getColumnSelectionMatrix: function() {
        var selectedColumnIndexes = this.getSelectedColumns();
        var numRows = this.getRowCount();
        var result = new Array(selectedColumnIndexes.length);
        selectedColumnIndexes.forEach(function(selectedColumnIndex, c) {
            result[c] = new Array(numRows);
            for (var r = 0; r < numRows; r++) {
                result[c][r] = valueOrFunctionExecute(this.getValue(selectedColumnIndex, r));
            }
        });
        return result;
    },

    getColumnSelection: function() {
        var selectedColumnIndexes = this.getSelectedColumns();
        var result = {};
        var rowCount = this.getRowCount();
        selectedColumnIndexes.forEach(function(selectedColumnIndex) {
            var column = new Array(rowCount);
            result[this.getField(selectedColumnIndex)] = column;
            for (var r = 0; r < rowCount; r++) {
                column[r] = valueOrFunctionExecute(this.getValue(selectedColumnIndex, r));
            }
        });
        return result;
    },

    getSelection: function() {
        var selections = this.getSelections();
        var result = new Array(selections.length);
        selections.forEach(function(selectionRect, i) {
            result[i] = this._getSelection(selectionRect);
        });
        return result;
    },

    _getSelection: function(rect) {
        rect = normalizeRect(rect);
        var colCount = rect.extent.x + 1;
        var rowCount = rect.extent.y + 1;
        var ox = rect.origin.x;
        var oy = rect.origin.y;
        var result = {};
        var r;
        for (var c = 0; c < colCount; c++) {
            var column = new Array(rowCount);
            result[this.getField(c + ox)] = column;
            for (r = 0; r < rowCount; r++) {
                column[r] = valueOrFunctionExecute(this.getValue(ox + c, oy + r));
            }
        }
        return result;
    },

    getSelectionMatrix: function() {
        var selections = this.getSelections();
        var result = new Array(selections.length);
        selections.forEach(function(selectionRect, i) {
            result[i] = this._getSelectionMatrix(selectionRect);
        });
        return result;
    },

    _getSelectionMatrix: function(rect) {
        rect = normalizeRect(rect);
        var colCount = rect.extent.x + 1;
        var rowCount = rect.extent.y + 1;
        var ox = rect.origin.x;
        var oy = rect.origin.y;
        var result = [];
        for (var c = 0; c < colCount; c++) {
            var column = new Array(rowCount);
            result[c] = column;
            for (var r = 0; r < rowCount; r++) {
                column[r] = valueOrFunctionExecute(this.getValue(ox + c, oy + r));
            }
        }
        return result;
    },
    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-context-menu` event
     * @param {keyEvent} event - The canvas event.
     */
    fireSyntheticContextMenuEvent: function(e) {
        e.gridCell = this.convertViewPointToDataPoint(e.gridCell);
        var event = new CustomEvent('fin-context-menu', {
            detail: {
                gridCell: e.gridCell,
                mousePoint: e.mousePoint,
                viewPoint: e.viewPoint,
                primitiveEvent: e.primitiveEvent,
                rows: this.getSelectedRows(),
                columns: this.getSelectedColumns(),
                selections: this.getSelectionModel().getSelections()
            }
        });
        this.canvas.dispatchEvent(event);
    },

    fireSyntheticMouseUpEvent: function(e) {
        var event = new CustomEvent('fin-mouseup', {
            detail: {
                gridCell: e.gridCell,
                mousePoint: e.mousePoint,
                viewPoint: e.viewPoint,
                primitiveEvent: e.primitiveEvent,
                rows: this.getSelectedRows(),
                columns: this.getSelectedColumns(),
                selections: this.getSelectionModel().getSelections()
            }
        });
        this.canvas.dispatchEvent(event);
    },

    fireSyntheticMouseDownEvent: function(e) {
        var event = new CustomEvent('fin-mousedown', {
            detail: {
                gridCell: e.gridCell,
                mousePoint: e.mousePoint,
                viewPoint: e.viewPoint,
                primitiveEvent: e.primitiveEvent,
                rows: this.getSelectedRows(),
                columns: this.getSelectedColumns(),
                selections: this.getSelectionModel().getSelections()
            }
        });
        this.canvas.dispatchEvent(event);
    },

    isViewableButton: function(c, r) {
        return this.getRenderer().isViewableButton(c, r);
    },

    fireSyntheticButtonPressedEvent: function(evt) {
        var dataCell = evt.dataCell;
        var gridCell = evt.gridCell;
        if (!this.isViewableButton(dataCell.x, dataCell.y)) {
            return;
        }
        var event = new CustomEvent('fin-button-pressed', {
            detail: {
                gridCell: gridCell
            }
        });
        this.canvas.dispatchEvent(event);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-keydown` event.
     * @param {keyEvent} event - The canvas event.
     */
    fireSyntheticKeydownEvent: function(keyEvent) {
        var clickEvent = new CustomEvent('fin-keydown', {
            detail: keyEvent.detail
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-keyup` event.
     * @param {keyEvent} event - The canvas event.
     */
    fireSyntheticKeyupEvent: function(keyEvent) {
        var clickEvent = new CustomEvent('fin-keyup', {
            detail: keyEvent.detail
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-cell-enter` event
     * @param {Point} cell - The pixel location of the cell in which the click event occurred.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticOnCellEnterEvent: function(cell) {
        var detail = {
            gridCell: cell,
            time: Date.now(),
            grid: this
        };
        var clickEvent = new CustomEvent('fin-cell-enter', {
            detail: detail
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    fireSyntheticGroupsChangedEvent: function(groups) {
        var detail = {
            groups: groups,
            time: Date.now(),
            grid: this
        };
        var clickEvent = new CustomEvent('fin-groups-changed', {
            detail: detail
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-cell-exit` event.
     * @param {Point} cell - The pixel location of the cell in which the click event occured.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticOnCellExitEvent: function(cell) {
        var detail = {
            gridCell: cell,
            time: Date.now(),
            grid: this
        };
        var clickEvent = new CustomEvent('fin-cell-exit', {
            detail: detail
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-cell-click` event.
     * @param {Point} cell - The pixel location of the cell in which the click event occured.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticClickEvent: function(mouseEvent) {
        var cell = mouseEvent.gridCell;
        var detail = {
            gridCell: cell,
            mousePoint: mouseEvent.mousePoint,
            keys: mouseEvent.keys,
            primitiveEvent: mouseEvent,
            time: Date.now(),
            grid: this
        };
        this.getBehavior().enhanceDoubleClickEvent(detail);
        var clickEvent = new CustomEvent('fin-click', {
            detail: detail
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a `fin-double-click` event.
     * @param {Point} cell - The pixel location of the cell in which the click event occured.
     * @param {MouseEvent} event - The system mouse event.
     */
    fireSyntheticDoubleClickEvent: function(mouseEvent) {
        var cell = mouseEvent.gridCell;
        var behavior = this.getBehavior();
        var detail = {
            gridCell: cell,
            mousePoint: mouseEvent.mousePoint,
            time: Date.now(),
            grid: this
        };
        behavior.enhanceDoubleClickEvent(mouseEvent);
        var clickEvent = new CustomEvent('fin-double-click', {
            detail: detail
        });
        behavior.cellDoubleClicked(cell, mouseEvent);
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a rendered event.
     */
    fireSyntheticGridRenderedEvent: function() {
        var event = new CustomEvent('fin-grid-rendered', {
            detail: {
                source: this,
                time: Date.now()
            }
        });
        if (this.canvas) {
            this.canvas.dispatchEvent(event);
        }
    },

    /**
     * @function
     * @instance
     * @desc Synthesize and fire a scroll event.
     * @param {string} type - Should be either `fin-scroll-x` or `fin-scroll-y`.
     * @param {number} oldValue - The old scroll value.
     * @param {number} newValue - The new scroll value.
     */
    fireScrollEvent: function(type, oldValue, newValue) {
        var event = new CustomEvent(type, {
            detail: {
                oldValue: oldValue,
                value: newValue,
                time: Date.now()
            }
        });
        this.canvas.dispatchEvent(event);

    },

    /**
     * @function
     * @instance
     * @desc Set the vertical scroll value.
     * @param {number} newValue - The new scroll value.
     */
    setVScrollValue: function(y) {
        y = Math.round(y);
        var max = this.sbVScroller.range.max;
        y = Math.min(max, Math.max(0, y));
        var self = this;
        if (y === this.vScrollValue) {
            return;
        }
        this.getBehavior()._setScrollPositionY(y);
        var oldY = this.vScrollValue;
        this.vScrollValue = y;
        this.scrollValueChangedNotification();
        setTimeout(function() {
            // self.sbVRangeAdapter.subjectChanged();
            self.fireScrollEvent('fin-scroll-y', oldY, y);
        });
    },

    /**
     * @function
     * @instance
     * @return {number} The vertical scroll value.
     */
    getVScrollValue: function() {
        return this.vScrollValue;
    },

    /**
     * @function
     * @instance
     * @desc Set the horizontal scroll value.
     * @param {number} newValue - The new scroll value.
     */
    setHScrollValue: function(x) {
        x = Math.round(x);
        var max = this.sbHScroller.range.max;
        x = Math.min(max, Math.max(0, x));
        var self = this;
        if (x === this.hScrollValue) {
            return;
        }
        this.getBehavior()._setScrollPositionX(x);
        var oldX = this.hScrollValue;
        this.hScrollValue = x;
        this.scrollValueChangedNotification();
        setTimeout(function() {
            //self.sbHRangeAdapter.subjectChanged();
            self.fireScrollEvent('fin-scroll-x', oldX, x);
        });
    },

    /**
     * @function
     * @instance
     * @returns The vertical scroll value.
     */
    getHScrollValue: function() {
        return this.hScrollValue;
    },

    /**
     * @function
     * @instance
     * @desc Request input focus.
     */
    takeFocus: function() {
        if (this.isEditing()) {
            this.stopEditing();
        } else {
            this.getCanvas().takeFocus();
        }
    },

    /**
     * @function
     * @instance
     * @desc Request focus for our cell editor.
     */
    editorTakeFocus: function() {
        if (this.cellEditor) {
            return this.cellEditor.takeFocus();
        }
    },

    /**
     * @function
     * @instance
     * @returns {boolean} We have a currently active cell editor.
     */
    isEditing: function() {
        if (this.cellEditor) {
            return this.cellEditor.isEditing;
        }
        return false;
    },

    /**
     * @function
     * @instance
     * @desc Initialize the scroll bars.
     */
    initScrollbars: function() {

        var self = this;

        var scrollbarHolder = this.shadowRoot.querySelector('#scrollbars');

        var horzBar = new FinBar({
            orientation: 'horizontal',
            onchange: function(idx) {
                self.setHScrollValue(idx);
            },
            cssStylesheetReferenceElement: scrollbarHolder,
            container: this.canvas.div
        });

        var vertBar = new FinBar({
            orientation: 'vertical',
            onchange: function(idx) {
                self.setVScrollValue(idx);
            },
            paging: {
                up: function() {
                    return self.pageUp();
                },
                down: function() {
                    return self.pageDown();
                },
            },
            container: this.canvas.div
        });

        this.sbHScroller = horzBar;
        this.sbVScroller = vertBar;

        this.sbHScroller.classPrefix = this.resolveProperty('hScrollbarClassPrefix');
        this.sbVScroller.classPrefix = this.resolveProperty('vScrollbarClassPrefix');

        scrollbarHolder.appendChild(horzBar.bar);
        scrollbarHolder.appendChild(vertBar.bar);

        this.resizeScrollbars();

    },

    resizeScrollbars: function() {
        this.sbHScroller.shortenBy(this.sbVScroller).resize();
        this.sbVScroller.shortenBy(this.sbHScroller).resize();
    },

    /**
     * @function
     * @instance
     * @desc Scroll values have changed, we've been notified.
     */
    setVScrollbarValues: function(max) {
        this.sbVScroller.range = {
            min: 0,
            max: max
        };
    },

    setHScrollbarValues: function(max) {
        this.sbHScroller.range = {
            min: 0,
            max: max
        };
    },

    scrollValueChangedNotification: function() {

        if (this.hScrollValue === this.sbPrevHScrollValue && this.vScrollValue === this.sbPrevVScrollValue) {
            return;
        }

        this.sbHValueHolder.changed = !this.sbHValueHolder.changed;
        this.sbVValueHolder.changed = !this.sbVValueHolder.changed;

        this.sbPrevHScrollValue = this.hScrollValue;
        this.sbPrevVScrollValue = this.vScrollValue;

        if (this.cellEditor) {
            this.cellEditor.scrollValueChangedNotification();
        }

        this.computeCellsBounds();
    },

    /**
     * @function
     * @instance
     * @summary Get data value at given cell.
     * @desc Delegates to the behavior.
     * @param {number} x - The horizontal coordinate.
     * @param {number} y - The vertical coordinate.
     * @param {*} value
     */
    getValue: function(x, y) {
        return this.getBehavior().getValue(x, y);
    },

    /**
     * @function
     * @instance
     * @desc Set a data value into the behavior (model) at the given point
     * @param {number} x - The horizontal coordinate.
     * @param {number} y - The vertical coordinate.
     */
    setValue: function(x, y, value) {
        this.getBehavior().setValue(x, y, value);
    },

    getColumnAlignment: function(c) {
        return this.getBehavior().getColumnAlignment(c);
    },

    /**
     * @function
     * @instance
     * @desc The data dimensions have changed, or our pixel boundries have changed.
     * Adjust the scrollbar properties as necessary.
     */
    synchronizeScrollingBoundries: function() {
        //327/664
        var behavior = this.getBehavior();

        var numFixedColumns = this.getFixedColumnCount();
        var numFixedRows = this.getFixedRowCount();

        var numColumns = this.getColumnCount();
        var numRows = this.getRowCount();

        var bounds = this.getBounds();
        if (!bounds) {
            return;
        }
        var scrollableHeight = bounds.height - behavior.getFixedRowsMaxHeight() - 15; //5px padding at bottom and right side
        var scrollableWidth = (bounds.width - 200) - behavior.getFixedColumnsMaxWidth() - 15;

        var lastPageColumnCount = 0;
        var columnsWidth = 0;
        for (; lastPageColumnCount < numColumns; lastPageColumnCount++) {
            var eachWidth = this.getColumnWidth(numColumns - lastPageColumnCount - 1);
            columnsWidth = columnsWidth + eachWidth;
            if (columnsWidth > scrollableWidth) {
                break;
            }
        }

        var lastPageRowCount = 0;
        var rowsHeight = 0;
        for (; lastPageRowCount < numRows; lastPageRowCount++) {
            var eachHeight = this.getRowHeight(numRows - lastPageRowCount - 1);
            rowsHeight = rowsHeight + eachHeight;
            if (rowsHeight > scrollableHeight) {
                break;
            }
        }

        var hMax = Math.max(0, numColumns - numFixedColumns - lastPageColumnCount);
        this.setHScrollbarValues(hMax);

        var vMax = Math.max(0, numRows - numFixedRows - lastPageRowCount);
        this.setVScrollbarValues(vMax);

        this.setHScrollValue(Math.min(this.getHScrollValue(), hMax));
        this.setVScrollValue(Math.min(this.getVScrollValue(), vMax));

        //this.getCanvas().resize();
        this.computeCellsBounds();
        this.repaint();

        this.resizeScrollbars();

    },

    /**
     * @function
     * @instance
     * @desc Note that "viewable rows" includes any partially viewable rows.
     * @returns {number} The number of viewable rows.
     */
    getVisibleRows: function() {
        return this.getRenderer().getVisibleRows();
    },

    /**
     * @function
     * @instance
     * @desc Note that "viewable columns" includes any partially viewable columns.
     * @returns {number} The number of viewable columns.
     */
    getVisibleColumns: function() {
        return this.getRenderer().getVisibleColumns();
    },

    /**
     * @function
     * @instance
     * @summary Initialize the renderer sub-component.
     */
    initRenderer: function() {
        this.renderer = new Renderer(this);
    },

    /**
     * @function
     * @instance
     * @returns {fin-hypergrid-renderer} sub-component
     */
    getRenderer: function() {
        return this.renderer;
    },

    /**
     * @function
     * @instance
     * @returns {number} The width of the given column.
     * @param {number} columnIndex - The untranslated column index.
     */
    getColumnWidth: function(columnIndex) {
        return this.getBehavior().getColumnWidth(columnIndex);
    },

    /**
     * @function
     * @instance
     * @desc Set the width of the given column.
     * @param {number} columnIndex - The untranslated column index.
     * @param {number} columnWidth - The width in pixels.
     */
    setColumnWidth: function(columnIndex, columnWidth) {
        this.getBehavior().setColumnWidth(columnIndex, columnWidth);
    },

    getColumnEdge: function(c) {
        return this.getBehavior().getColumnEdge(c, this.getRenderer());
    },

    /**
     * @function
     * @instance
     * @returns {number} The total width of all the fixed columns.
     */
    getFixedColumnsWidth: function() {
        return this.getBehavior().getFixedColumnsWidth();
    },

    /**
     * @function
     * @instance
     * @returns {number} The height of the given row
     * @param {number} rowIndex - The untranslated fixed column index.
     */
    getRowHeight: function(rowIndex) {
        return this.getBehavior().getRowHeight(rowIndex);
    },

    /**
     * @function
     * @instance
     * @desc Set the height of the given row.
     * @param {number} rowIndex - The row index.
     * @param {number} rowHeight - The width in pixels.
     */
    setRowHeight: function(rowIndex, rowHeight) {
        this.getBehavior().setRowHeight(rowIndex, rowHeight);
    },

    /**
     * @function
     * @instance
     * @returns {number} The total fixed rows height
     */
    getFixedRowsHeight: function() {
        return this.getBehavior().getFixedRowsHeight();
    },

    /**
     * @function
     * @instance
     * @returns {number} The number of columns.
     */
    getColumnCount: function() {
        return this.getBehavior().getColumnCount();
    },

    /**
     * @function
     * @instance
     * @returns {number} The number of fixed rows.
     */
    getRowCount: function() {
        return this.getBehavior().getRowCount();
    },

    /**
     * @function
     * @instance
     * @returns {number} The number of fixed columns.
     */
    getFixedColumnCount: function() {
        return this.getBehavior().getFixedColumnCount();
    },

    /**
     * @function
     * @instance
     * @returns The number of fixed rows.
     */
    getFixedRowCount: function() {
        return this.getBehavior().getFixedRowCount();
    },

    /**
     * @function
     * @instance
     * @summary The top left area has been clicked on
     * @desc Delegates to the behavior.
     * @param {event} event - The event details.
     */
    topLeftClicked: function(mouse) {
        this.getBehavior().topLeftClicked(this, mouse);
    },

    /**
     * @function
     * @instance
     * @summary A fixed row has been clicked.
     * @desc Delegates to the behavior.
     * @param {event} event - The event details.
     */
    rowHeaderClicked: function(mouse) {
        this.getBehavior().rowHeaderClicked(this, mouse);
    },

    /**
     * @function
     * @instance
     * @summary A fixed column has been clicked.
     * @desc Delegates to the behavior.
     * @param {event} event - The event details.
     */
    columnHeaderClicked: function(mouse) {
        this.getBehavior().columnHeaderClicked(this, mouse);
    },

    /**
     * @function
     * @instance
     * @desc An edit event has occurred. Activate the editor.
     * @param {event} event - The event details.
     */
    _activateEditor: function(event) {
        var gridCell = event.gridCell;
        this.activateEditor(gridCell.x, gridCell.y);
    },

    /**
     * @function
     * @instance
     * @desc Activate the editor at the given coordinates.
     * @param {x} x - The horizontal coordinate.
     * @param {y} y - The vertical coordinate.
     */
    activateEditor: function(x, y) {
        if (!this.isEditable() && !this.isFilterRow(y)) {
            return;
        }
        var editor = this.getCellEditorAt(x, y);
        if (!editor) {
            return;
        }
        var point = editor.editorPoint;
        if (editor) {
            if (point.x === x && point.y === y && editor.isEditing) {
                return; //we're already open at this location
            } else if (this.isEditing()) {
                this.stopEditing(); //other editor is open, close it first
            }
            event.gridCell = {
                x: x,
                y: y
            };
            this.editAt(editor, event);
        }
    },

    /**
     * @function
     * @instance
     * @summary Get the cell editor.
     * @desc Delegates to the behavior.
     * @returns The cell editor at the given coordinates.
     * @param {x} x - The horizontal coordinate.
     * @param {y} y - The vertical coordinate.
     */
    getCellEditorAt: function(x, y) {
        return this.getBehavior().getCellEditorAt(x, y);
    },

    /**
     * @function
     * @instance
     * @summary Toggle HiDPI support.
     * @desc HiDPI support is now *on* by default.
     * > There used to be a bug in Chrome that caused severe slow down on bit blit of large images, so this HiDPI needed to be optional.
     */
    toggleHiDPI: function() {
        if (this.useHiDPI()) {
            this.removeAttribute('hidpi');
        } else {
            this.setAttribute('hidpi', null);
        }
        this.canvas.resize();
    },

    /**
     * @function
     * @instance
     * @returns {number} Te HiDPI ratio.
     */
    getHiDPI: function(ctx) {
        if (window.devicePixelRatio && this.useHiDPI()) {
            var devicePixelRatio = window.devicePixelRatio || 1;
            var backingStoreRatio = ctx.webkitBackingStorePixelRatio ||
                ctx.mozBackingStorePixelRatio ||
                ctx.msBackingStorePixelRatio ||
                ctx.oBackingStorePixelRatio ||
                ctx.backingStorePixelRatio || 1;

            var ratio = devicePixelRatio / backingStoreRatio;
            return ratio;
        } else {
            return 1;
        }
    },

    /**
     * @function
     * @instance
     * @returns {number} The width of the given (recently rendered) column.
     * @param {number} colIndex - The column index.
     */
    getRenderedWidth: function(colIndex) {
        return this.renderer.getRenderedWidth(colIndex);
    },

    /**
     * @function
     * @instance
     * @returns {number} The height of the given (recently rendered) row.
     * @param {number} rowIndex - Tthe row index.
     */
    getRenderedHeight: function(rowIndex) {
        return this.renderer.getRenderedHeight(rowIndex);
    },

    /**
     * @function
     * @instance
     * @returns {fin-hypergrid-cell-editor} The cell editor at alias "name" (a sub-component).
     * @param {string} name
     */
    resolveCellEditor: function(name) {
        return this.cellEditors[name];
    },

    /**
     * @function
     * @instance
    update the cursor under the hover cell
     */
    updateCursor: function() {
        var translate = this.getBehavior();
        var cursor = translate.getCursorAt(-1, -1);
        var hoverCell = this.getHoverCell();
        if (hoverCell && hoverCell.x > -1 && hoverCell.y > -1) {
            var x = hoverCell.x + this.getHScrollValue();
            cursor = translate.getCursorAt(x, hoverCell.y + this.getVScrollValue());
        }
        this.beCursor(cursor);
    },

    /**
     * @function
     * @instance
     * @desc Repaint the given cell.
     * @param {x} x - The horizontal coordinate.
     * @param {y} y - The vertical coordinate.
     */
    repaintCell: function(x, y) {
        this.getRenderer().repaintCell(x, y);
    },

    /**
     * @function
     * @instance
     * @returns {boolean} The user is currently dragging a column to reorder it.
     */
    isDraggingColumn: function() {
        return !!this.renderOverridesCache.dragger;
    },

    /**
     * @function
     * @instance
     * @desc Scroll up one full page.
     * @returns {number}
     */
    pageUp: function() {
        var rowNum = this.getRenderer().getPageUpRow();
        this.setVScrollValue(rowNum);
        return rowNum;
    },

    /**
     * @function
     * @instance
     * @desc Scroll down one full page.
     * @returns {number}
     */
    pageDown: function() {
        var rowNum = this.getRenderer().getPageDownRow();
        this.setVScrollValue(rowNum);
        return rowNum;
    },

    /**
     * @function
     * @instance
     * @desc Not yet implemented.
     */
    pageLeft: function() {
        console.log('page left');
    },

    /**
     * @function
     * @instance
     * @desc Not yet implemented.
     */
    pageRight: function() {
        console.log('page right');
    },

    /**
     * @function
     * @instance
     * @returns {object[]} Objects with the values that were just rendered.
     */
    getRenderedData: function() {
        // assumes one row of headers
        var behavior = this.getBehavior(),
            renderer = this.getRenderer(),
            colCount = this.getColumnCount(),
            rowCount = renderer.getVisibleRows(),
            headers = new Array(colCount),
            results = new Array(rowCount),
            row;

        headers.forEach(function(header, c) {
            headers[c] = behavior.getColumnId(c, 0);
        });

        results.forEach(function(result, r) {
            row = results[r] = {
                hierarchy: behavior.getFixedColumnValue(0, r)
            };
            headers.forEach(function(field, c) {
                row[field] = behavior.getValue(c, r);
            });
        });

        return results;
    },

    /**
     * @function
     * @instance
     * @returns {object} An object that represents the currently selection row.
     */
    getSelectedRow: function() {
        var sels = this.getSelectionModel().getSelections();
        if (sels.length) {
            var behavior = this.getBehavior(),
                colCount = this.getColumnCount(),
                topRow = sels[0].origin.y,
                row = {
                    hierarchy: behavior.getFixedColumnValue(0, topRow)
                };

            for (var c = 0; c < colCount; c++) {
                row[behavior.getColumnId(c, 0)] = behavior.getValue(c, topRow);
            }

            return row;
        }
    },

    fireRequestCellEdit: function(cell, value) {
        var clickEvent = new CustomEvent('fin-request-cell-edit', {
            cancelable: true,
            detail: {
                value: value,
                gridCell: cell,
                time: Date.now()
            }
        });
        return this.canvas.dispatchEvent(clickEvent); //I wasn't cancelled
    },
    /**
     * @function
     * @instance
     * @desc Synthesize and fire a fin-before-cell-edit event.
     * @param {Point} cell - The x,y coordinates.
     * @param {Object} value - The current value.
     */
    fireBeforeCellEdit: function(cell, oldValue, newValue, control) {
        var clickEvent = new CustomEvent('fin-before-cell-edit', {
            cancelable: true,
            detail: {
                oldValue: oldValue,
                newValue: newValue,
                gridCell: cell,
                time: Date.now(),
                input: control
            }
        });
        var proceed = this.canvas.dispatchEvent(clickEvent);
        return proceed; //I wasn't cancelled
    },

    /**
     * @function
     * @instance
     * @returns {fin-hypergrid-renderer} sub-component
     * @param {Point} cell - The x,y coordinates.
     * @param {Object} oldValue - The old value.
     * @param {Object} newValue - The new value.
     */
    fireAfterCellEdit: function(cell, oldValue, newValue, control) {
        var clickEvent = new CustomEvent('fin-after-cell-edit', {
            detail: {
                newValue: newValue,
                oldValue: oldValue,
                gridCell: cell,
                time: Date.now(),
                input: control
            }
        });
        this.canvas.dispatchEvent(clickEvent);
    },

    /**
     * @function
     * @instance
     * @desc Autosize the column at colIndex for best fit.
     * @param {number} colIndex - The column index to modify at
     */
    autosizeColumn: function(colIndex) {
        var column = this.getBehavior().getColumn(colIndex);
        column.checkColumnAutosizing(true);
        this.computeCellsBounds();
    },

    /**
     * @function
     * @instance
     * @desc Enable/disable if this component can receive the focus.
     * @param {boolean} - canReceiveFocus
     */
    setFocusable: function(canReceiveFocus) {
        this.getCanvas().setFocusable(canReceiveFocus);
    },

    /**
     * @function
     * @instance
     * @returns {number} The number of columns that were just rendered
     */
    getVisibleColumnsCount: function() {
        return this.getRenderer().getVisibleColumnsCount();
    },

    /**
     * @function
     * @instance
     * @returns {number} The number of rows that were just rendered
     */
    getVisibleRowsCount: function() {
        return this.getRenderer().getVisibleRowsCount();
    },

    /**
     * @function
     * @instance
    update the size of the grid
     *
     * #### returns: integer
     */
    updateSize: function() {
        this.canvas.checksize();
    },


    /**
     * @function
     * @instance
     * @desc Stop the global repainting flag thread.
     */
    stopPaintThread: function() {
        this.canvas.stopPaintThread();
    },

    /**
     * @function
     * @instance
     * @desc Stop the global resize check flag thread.
     */
    stopResizeThread: function() {
        this.canvas.stopResizeThread();
    },

    /**
     * @function
     * @instance
     * @desc Restart the global resize check flag thread.
     */
    restartResizeThread: function() {
        this.canvas.restartResizeThread();
    },

    /**
     * @function
     * @instance
     * @desc Restart the global repainting check flag thread.
     */
    restartPaintThread: function() {
        this.canvas.restartPaintThread();
    },

    swapColumns: function(source, target) {
        this.getBehavior().swapColumns(source, target);
    },

    endDragColumnNotification: function() {
        this.getBehavior().endDragColumnNotification();
    },

    getFixedColumnsMaxWidth: function() {
        return this.getBehavior().getFixedColumnsMaxWidth();
    },

    isMouseDownInHeaderArea: function() {
        var numHeaderColumns = this.getHeaderColumnCount();
        var numHeaderRows = this.getHeaderRowCount();
        var mouseDown = this.getMouseDown();
        return mouseDown.x < numHeaderColumns || mouseDown.y < numHeaderRows;
    },

    _getBoundsOfCell: function(x, y) {
        var bounds = this.getRenderer()._getBoundsOfCell(x, y);
        return bounds;
    },

    getColumnProperties: function(columnIndex) {
        var properties = this.getBehavior().getColumnProperties(columnIndex);
        return properties;
    },

    setColumnProperties: function(columnIndex, properties) {
        this.getBehavior().setColumnProperties(columnIndex, properties);
    },

    moveSingleSelect: function(x, y) {
        this.getBehavior().moveSingleSelect(this, x, y);
    },

    selectCell: function(x, y) {
        this.getSelectionModel().clear();
        this.getSelectionModel().select(x, y, 0, 0);
    },

    getHeaderColumnCount: function() {
        return this.getBehavior().getHeaderColumnCount();
    },

    toggleSort: function(x, keys) {
        this.stopEditing();
        var behavior = this.getBehavior();
        var self = this;
        behavior.toggleSort(x, keys);

        setTimeout(function() {
            self.synchronizeScrollingBoundries();
            //self.behaviorChanged();
            if (self.isColumnAutosizing()) {
                behavior.autosizeAllColumns();
            }
            self.repaint();
        }, 10);
    },

    toggleSelectColumn: function(x, keys) {
        keys = keys || [];
        var model = this.getSelectionModel();
        var alreadySelected = model.isColumnSelected(x);
        var hasCTRL = keys.indexOf('CTRL') > -1;
        var hasSHIFT = keys.indexOf('SHIFT') > -1;
        if (!hasCTRL && !hasSHIFT) {
            model.clear();
            if (!alreadySelected) {
                model.selectColumn(x);
            }
        } else {
            if (hasCTRL) {
                if (alreadySelected) {
                    model.deselectColumn(x);
                } else {
                    model.selectColumn(x);
                }
            }
            if (hasSHIFT) {
                model.clear();
                model.selectColumn(this.lastEdgeSelection[0], x);
            }
        }
        if (!alreadySelected && !hasSHIFT) {
            this.lastEdgeSelection[0] = x;
        }
        this.repaint();
        this.fireSyntheticColumnSelectionChangedEvent();
    },

    toggleSelectRow: function(y, keys) {

        //we can select the totals rows if they exist,
        //but not rows above that
        var selectionEdge = this.getFilterRowIndex() + 1;
        if (y < selectionEdge) {
            return;
        }

        keys = keys || [];

        var isSingleRowSelection = this.isSingleRowSelectionMode();
        var model = this.getSelectionModel();
        var alreadySelected = model.isRowSelected(y);
        var hasCTRL = keys.indexOf('CTRL') > -1;
        var hasSHIFT = keys.indexOf('SHIFT') > -1;

        if (!hasCTRL && !hasSHIFT) {
            model.clear();
            if (!alreadySelected) {
                model.selectRow(y);
            }
        } else {
            if (hasCTRL) {
                if (alreadySelected) {
                    model.deselectRow(y);
                } else {
                    if (isSingleRowSelection) {
                        model.clearRowSelection();
                    }
                    model.selectRow(y);
                }
            }
            if (hasSHIFT) {
                model.clear();
                model.selectRow(this.lastEdgeSelection[1], y);
            }
        }
        if (!alreadySelected && !hasSHIFT) {
            this.lastEdgeSelection[1] = y;
        }
        this.repaint();
    },


    isShowRowNumbers: function() {
        return this.resolveProperty('showRowNumbers');
    },
    isEditable: function() {
        return this.resolveProperty('editable') === true;
    },
    isShowFilterRow: function() {
        return this.resolveProperty('showFilterRow');
    },
    isShowHeaderRow: function() {
        return this.resolveProperty('showHeaderRow');
    },
    getHeaderRowCount: function() {
        return this.getBehavior().getHeaderRowCount();
    },
    isFilterRow: function(y) {
        return y === this.getFilterRowIndex();
    },
    getFilterRowIndex: function() {
        if (!this.isShowFilterRow()) {
            return -1;
        }
        if (this.isShowHeaderRow()) {
            return 1;
        } else {
            return 0;
        }
    },
    setGroups: function(arrayOfColumnIndexes) {
        this.getBehavior().setGroups(arrayOfColumnIndexes);
    },
    filterClicked: function(event) {
        this.activateEditor(event.gridCell.x, event.gridCell.y);
    },
    hasHierarchyColumn: function() {
        return this.getBehavior().hasHierarchyColumn();
    },
    isHierarchyColumn: function(x) {
        if (!this.hasHierarchyColumn()) {
            return false;
        }
        return x === 0;
    },
    checkScrollbarVisibility: function() {
        // var hoverClassOver = this.resolveProperty('scrollbarHoverOver');
        // var hoverClassOff = this.resolveProperty('scrollbarHoverOff');

        // if (hoverClassOff === 'visible') {
        //     this.sbHScroller.classList.remove(hoverClassOver);
        //     this.sbVScroller.classList.remove(hoverClassOff);
        //     this.sbHScroller.classList.add('visible');
        //     this.sbVScroller.classList.add('visible');
        // }
    },
    isColumnOrRowSelected: function() {
        return this.getSelectionModel().isColumnOrRowSelected();
    },
    selectColumn: function(x1, x2) {
        this.getSelectionModel().selectColumn(x1, x2);
    },
    selectRow: function(y1, y2) {
        if (this.isSingleRowSelectionMode()) {
            this.getSelectionModel().clearRowSelection();
            y1 = y2;
        } else {
            y2 = y2 || y1;
        }
        var min = Math.min(y1, y2);
        var max = Math.max(y1, y2);
        var selectionEdge = this.getFilterRowIndex() + 1;
        if (min < selectionEdge) {
            return;
        }
        this.getSelectionModel().selectRow(min, max);
    },
    isRowSelected: function(r) {
        return this.getSelectionModel().isRowSelected(r);
    },
    isColumnSelected: function(c) {
        return this.getSelectionModel().isColumnSelected(c);
    },
    lookupFeature: function(key) {
        return this.getBehavior().lookupFeature(key);
    },
    getRow: function(y) {
        return this.getBehavior().getRow(y);
    },
    getFieldName: function(index) {
        return this.getBehavior().getFieldName(index);
    },

    getColumnIndex: function(fieldName) {
        return this.getBehavior().getColumnIndex(fieldName);
    },
    isCellSelection: function() {
        return this.resolveProperty('cellSelection') === true;
    },
    isRowSelection: function() {
        return this.resolveProperty('rowSelection') === true;
    },
    isColumnSelection: function() {
        return this.resolveProperty('columnSelection') === true;
    },
    getComputedRow: function(y) {
        return this.getBehavior().getComputedRow(y);
    },
    isColumnAutosizing: function() {
        return this.resolveProperty('columnAutosizing') === true;
    },
    setGlobalFilter: function(string) {
        this.getBehavior().setGlobalFilter(string);
    },
    selectRowsFromCells: function() {
        var sm = this.getSelectionModel();
        if (this.isSingleRowSelectionMode()) {
            var last = sm.getLastSelection();
            if (!last) {
                sm.clearRowSelection();
            } else {
                this.selectRow(null, last.corner.y);
            }
        } else {
            sm.selectRowsFromCells();
        }
    },
    selectColumnsFromCells: function() {
        this.getSelectionModel().selectColumnsFromCells();
    },
    getSelectedRows: function() {
        return this.getBehavior().getSelectedRows();
    },
    getSelectedColumns: function() {
        return this.getBehavior().getSelectedColumns();
    },
    getSelections: function() {
        return this.getBehavior().getSelections();
    },
    getLastSelectionType: function() {
        return this.getSelectionModel().getLastSelectionType();
    },
    isCellSelected: function(x, y) {
        return this.getSelectionModel().isCellSelected(x, y);
    },
    isInCurrentSelectionRectangle: function(x, y) {
        return this.getSelectionModel().isInCurrentSelectionRectangle(x, y);
    },
    selectAllRows: function() {
        this.getSelectionModel().selectAllRows();
    },
    areAllRowsSelected: function() {
        return this.getSelectionModel().areAllRowsSelected();
    },
    toggleSelectAllRows: function() {
        if (this.areAllRowsSelected()) {
            this.getSelectionModel().clear();
        } else {
            this.selectAllRows();
        }
        this.repaint();
    },
    getField: function(x) {
        return this.getBehavior().getField(x);
    },
    isSingleRowSelectionMode: function() {
        return this.resolveProperty('singleRowSelectionMode');
    },
    newPoint: function(x, y) {
        return new Point(x, y);
    },
    newRectangle: function(x, y, width, height) {
        return new Rectangle(x, y, width, height);
    }
};

var globalCellEditors = {};
var propertiesInitialized = false;

/**
 *
 * @property {object} fontData - The cached font heights.
 */
var fontData = {};

/**
 *
 * @property {SimpleLRU} textWidthCache - A LRU cache of 10000 of text widths.
 */
var textWidthCache = new LRUCache(2000);


var getTextWidth = function(gc, string) {
    if (string === null || string === undefined) {
        return 0;
    }
    string = string + '';
    if (string.length === 0) {
        return 0;
    }
    var key = gc.font + string;
    var width = textWidthCache.get(key);
    if (!width) {
        width = gc.measureText(string).width;
        textWidthCache.set(key, width);
    }
    return width;
};

var getTextHeight = function(font) {

    var result = fontData[font];
    if (result) {
        return result;
    }
    result = {};
    var text = document.createElement('span');
    text.textContent = 'Hg';
    text.style.font = font;

    var block = document.createElement('div');
    block.style.display = 'inline-block';
    block.style.width = '1px';
    block.style.height = '0px';

    var div = document.createElement('div');
    div.appendChild(text);
    div.appendChild(block);

    div.style.position = 'absolute';
    document.body.appendChild(div);

    try {

        block.style.verticalAlign = 'baseline';

        var blockRect = block.getBoundingClientRect();
        var textRect = text.getBoundingClientRect();

        result.ascent = blockRect.top - textRect.top;

        block.style.verticalAlign = 'bottom';
        result.height = blockRect.top - textRect.top;

        result.descent = result.height - result.ascent;

    } finally {
        document.body.removeChild(div);
    }
    if (result.height !== 0) {
        fontData[font] = result;
    }
    return result;
};

var defaultProperties = function() {
    var properties = {
        //these are for the theme
        font: '13px Tahoma, Geneva, sans-serif',
        color: 'rgb(25, 25, 25)',
        backgroundColor: 'rgb(241, 241, 241)',
        foregroundSelectionColor: 'rgb(25, 25, 25)',
        backgroundSelectionColor: 'rgb(183, 219, 255)',

        columnHeaderFont: '12px Tahoma, Geneva, sans-serif',
        columnHeaderColor: 'rgb(25, 25, 25)',
        columnHeaderBackgroundColor: 'rgb(223, 227, 232)',
        columnHeaderForegroundSelectionColor: 'rgb(25, 25, 25)',
        columnHeaderBackgroundSelectionColor: 'rgb(255, 220, 97)',
        columnHeaderForegroundColumnSelectionColor: 'rgb(25, 25, 25)',
        columnHeaderBackgroundColumnSelectionColor: 'rgb(255, 180, 0)',

        rowHeaderFont: '12px Tahoma, Geneva, sans-serif',
        rowHeaderColor: 'rgb(25, 25, 25)',
        rowHeaderBackgroundColor: 'rgb(223, 227, 232)',
        rowHeaderForegroundSelectionColor: 'rgb(25, 25, 25)',
        rowHeaderBackgroundSelectionColor: 'rgb(255, 220, 97)',
        rowHeaderForegroundRowSelectionColor: 'rgb(25, 25, 25)',
        rowHeaderBackgroundRowSelectionColor: 'rgb(255, 180, 0)',

        filterFont: '12px Tahoma, Geneva, sans-serif',
        filterColor: 'rgb(25, 25, 25)',
        filterBackgroundColor: 'white',
        filterForegroundSelectionColor: 'rgb(25, 25, 25)',
        filterBackgroundSelectionColor: 'rgb(255, 220, 97)',
        filterCellBorderStyle: 'rgba(0,0,0,0.8)',
        filterCellBorderThickness: '0.4',

        treeColumnFont: '12px Tahoma, Geneva, sans-serif',
        treeColumnColor: 'rgb(25, 25, 25)',
        treeColumnBackgroundColor: 'rgb(223, 227, 232)',
        treeColumnForegroundSelectionColor: 'rgb(25, 25, 25)',
        treeColumnBackgroundSelectionColor: 'rgb(255, 220, 97)',
        treeColumnForegroundColumnSelectionColor: 'rgb(25, 25, 25)',
        treeColumnBackgroundColumnSelectionColor: 'rgb(255, 180, 0)',

        backgroundColor2: 'rgb(201, 201, 201)',
        voffset: 0,
        scrollbarHoverOver: 'visible',
        scrollbarHoverOff: 'hidden',
        scrollingEnabled: true,
        vScrollbarClassPrefix: 'fin-sb-user',
        hScrollbarClassPrefix: 'fin-sb-user',

        //these used to be in the constants element
        fixedRowAlign: 'center',
        fixedColAlign: 'center',
        cellPadding: 5,
        gridLinesH: true,
        gridLinesV: true,
        lineColor: 'rgb(199, 199, 199)',
        lineWidth: 0.4,

        defaultRowHeight: 15,
        defaultColumnWidth: 100,

        //for immediate painting, set these values to 0, true respectively
        repaintIntervalRate: 60,
        repaintImmediately: false,

        //enable or disable double buffering
        useBitBlit: false,

        useHiDPI: true,
        editorActivationKeys: ['alt', 'esc'],
        readOnly: false,

        //inhertied by cell renderers
        getTextWidth: getTextWidth,
        getTextHeight: getTextHeight,

        fixedColumnCount: 0,
        fixedRowCount: 0,
        headerColumnCount: 0,

        showRowNumbers: true,
        showHeaderRow: true,
        showFilterRow: true,

        cellSelection: true,
        columnSelection: true,
        rowSelection: true,
        singleRowSelectionMode: true,

        columnAutosizing: true,
        rowResize: false

    };
    return properties;
};

var normalizeRect = function(rect) {
    var o = rect.origin;
    var c = rect.corner;

    var ox = Math.min(o.x, c.x);
    var oy = Math.min(o.y, c.y);

    var cx = Math.max(o.x, c.x);
    var cy = Math.max(o.y, c.y);

    var result = new Rectangle(ox, oy, cx - ox, cy - oy);

    return result;
};

var buildPolymerTheme = function() {
    clearObjectProperties(polymerTheme);
    var pb = document.createElement('paper-button');

    pb.style.display = 'none';
    pb.setAttribute('disabled', true);
    document.body.appendChild(pb);
    var p = window.getComputedStyle(pb);

    var section = document.createElement('section');
    section.style.display = 'none';
    section.setAttribute('hero', true);
    document.body.appendChild(section);

    var h = window.getComputedStyle(document.querySelector('html'));
    var hb = window.getComputedStyle(document.querySelector('html, body'));
    var s = window.getComputedStyle(section);

    polymerTheme.columnHeaderBackgroundColor = p.color;
    polymerTheme.rowHeaderBackgroundColor = p.color;
    polymerTheme.topLeftBackgroundColor = p.color;
    polymerTheme.lineColor = p.backgroundColor;

    polymerTheme.backgroundColor2 = hb.backgroundColor;

    polymerTheme.color = h.color;
    polymerTheme.fontFamily = h.fontFamily;
    polymerTheme.backgroundColor = s.backgroundColor;

    pb.setAttribute('disabled', false);
    pb.setAttribute('secondary', true);
    pb.setAttribute('raised', true);
    p = window.getComputedStyle(pb);

    polymerTheme.columnHeaderColor = p.color;
    polymerTheme.rowHeaderColor = p.color;
    polymerTheme.topLeftColor = p.color;


    polymerTheme.backgroundSelectionColor = p.backgroundColor;
    polymerTheme.foregroundSelectionColor = p.color;

    pb.setAttribute('secondary', false);
    pb.setAttribute('warning', true);

    polymerTheme.columnHeaderForegroundSelectionColor = p.color;
    polymerTheme.columnHeaderBackgroundSelectionColor = p.backgroundColor;
    polymerTheme.rowHeaderForegroundSelectionColor = p.color;
    polymerTheme.fixedColumnBackgroundSelectionColor = p.backgroundColor;

    //check if there is actually a theme loaded if not, clear out all bogus values
    //from my cache
    if (polymerTheme.columnHeaderBackgroundSelectionColor === 'rgba(0, 0, 0, 0)' ||
        polymerTheme.lineColor === 'transparent') {
        clearObjectProperties(polymerTheme);
    }

    document.body.removeChild(pb);
    document.body.removeChild(section);
};

var clearObjectProperties = function(obj) {
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            delete obj[prop];
        }
    }
};

var valueOrFunctionExecute = function(valueOrFunction) {
    var result = typeof valueOrFunction === 'function' ? valueOrFunction() : valueOrFunction;
    return result || result === 0 ? result : '';
};

var defaults = defaultProperties(),
    polymerTheme = Object.create(defaults),
    globalProperties = Object.create(polymerTheme);

function initializeCellEditor(cellEditor) {
    globalCellEditors[cellEditor.alias] = cellEditor;
}

module.exports = Hypergrid;
