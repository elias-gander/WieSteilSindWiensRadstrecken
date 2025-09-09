import { createApp, reactive } from "https://unpkg.com/petite-vue?module";

window.App = reactive({
  cursorX: 0,
  cursorY: 0,
  isReady: false,
  slopeLabel: "",
  lengthLabel: "",
  isLegendPresented: true,
  lowerThumbOffset: 0,
  lowerThumbValue: 0,
  upperThumbOffset: 0,
  upperThumbValue: Number.MAX_VALUE,
  dragging: null,
  isFiltering: false,
  isInfosPresented: false,
  visibleSegmentLength: 0,
  filteredSegmentLength: 0,
  get visibleSegmentLengthLabel() {
    return toLengthString(this.visibleSegmentLength);
  },
  get filteredSegmentsLengthPercentage() {
    return this.visibleSegmentLength == 0
      ? 0
      : (this.filteredSegmentLength / this.visibleSegmentLength) * 100;
  },
  get filteredSegmentsLengthLabel() {
    return toLengthString(this.filteredSegmentLength);
  },
  get notFilteredSegmentsLengthLabel() {
    return toLengthString(
      this.visibleSegmentLength - this.filteredSegmentLength
    );
  },
  get filteredSegmentsLengthPercentageLabel() {
    return toPercentageString(this.filteredSegmentsLengthPercentage);
  },
  get notFilteredSegmentsLengthPercentageLabel() {
    return toPercentageString(100 - this.filteredSegmentsLengthPercentage);
  },
  get lowerThumbLabel() {
    return `${(this.lowerThumbValue * 100).toFixed(1)}`;
  },
  get upperThumbLabel() {
    return this.upperThumbValue == Number.MAX_VALUE
      ? "≥15"
      : `${(this.upperThumbValue * 100).toFixed(1)}`;
  },

  startDragging(thumbId) {
    this.dragging = thumbId;
  },

  drag(e) {
    if (!this.dragging) return;
    const rect = document
      .querySelector("#legend-gradient")
      .getBoundingClientRect();
    if (this.dragging === "lower") {
      this.lowerThumbOffset = clamp(
        e.clientX - rect.left,
        0,
        rect.width - this.upperThumbOffset - 15
      );
      this.lowerThumbValue = 0.15 * (this.lowerThumbOffset / rect.width);
    } else {
      this.upperThumbOffset = clamp(
        rect.right - e.clientX,
        0,
        rect.width - this.lowerThumbOffset - 15
      );
      this.upperThumbValue = 0.15 - 0.15 * (this.upperThumbOffset / rect.width);
      if (this.upperThumbValue == 0.15) {
        this.upperThumbValue = Number.MAX_VALUE;
      }
    }
  },

  stopDragging() {
    this.dragging = null;
    this.isFiltering =
      this.lowerThumbValue > 0 || this.upperThumbValue < Number.MAX_VALUE;
    updateSegmentLengths();
    map.setPaintProperty("segments", "line-color", [
      "case",
      ["<", ["coalesce", ["get", "slope"], 0], this.lowerThumbValue],
      "#e4e4e4ff",
      [">", ["coalesce", ["get", "slope"], 0], this.upperThumbValue],
      "#e4e4e4ff",
      ["get", "color"],
    ]);
  },
});

createApp(window.App).mount();

const map = new maplibregl.Map({
  container: "map",
  style: "street-labels-style.json",
  attributionControl: false,
  center: [16.3738, 48.2082],
  maxBounds: [
    [16.15990817, 48.09620512],
    [16.58841854, 48.34667157],
  ],
  zoom: 12,
  maxZoom: 20,
  minZoom: 9,
  dragRotate: false,
  pitchWithRotate: false,
  rollEnabled: false,
  touchPitch: false,
});
let spatialSegmentIndex = undefined;

function toPercentageString(p) {
  return p > 0 && p < 1
    ? "<1%"
    : p > 99 && p < 100
    ? ">99%"
    : `${Math.trunc(p)}%`;
}

function toLengthString(l) {
  return l > 1000 ? `${Math.trunc(l / 1000)} km` : `${l} m`;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

async function fetchContours() {
  if (map.getZoom() < 15) {
    return;
  }
  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
  const url = `https://data.wien.gv.at/daten/geo?service=WFS&version=1.1.0&request=GetFeature&typeName=ogdwien:HOEHENLINIEOGD&bbox=${bbox.join(
    ","
  )},EPSG:4326&srsName=EPSG:4326&outputFormat=json`;
  const response = await fetch(url);
  const data = await response.json();
  map.getSource("contour")?.setData(data);
}

function hideSlopePopup() {
  App.slopeLabel = "";
  App.lengthLabel = "";
  map.getSource("selected-segment").setData({
    type: "FeatureCollection",
    features: [],
  });
  map.getCanvas().style.cursor = "";
}

function updateSlopePopup(feature) {
  if (
    feature.properties.slope > App.upperThumbValue ||
    feature.properties.slope < App.lowerThumbValue
  ) {
    hideSlopePopup();
  } else {
    App.slopeLabel =
      feature.properties.slope == null
        ? "Über/unter Brücke"
        : `${(feature.properties.slope * 100).toFixed(2)}% Neigung`;
    App.lengthLabel = `↔ ${feature.properties.length.toFixed(2)} m`;
    map.getSource("selected-segment").setData({
      type: "FeatureCollection",
      features: [feature],
    });
    map.getCanvas().style.cursor = "help";
  }
}

function initSpatialSegmentIndex(segments) {
  spatialSegmentIndex = new RBush();
  spatialSegmentIndex.load(
    segments.map((feature, _) => {
      const coords = feature.geometry.coordinates;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      coords.forEach(([lng, lat]) => {
        minX = Math.min(minX, lng);
        minY = Math.min(minY, lat);
        maxX = Math.max(maxX, lng);
        maxY = Math.max(maxY, lat);
      });
      return { minX, minY, maxX, maxY, feature };
    })
  );
}

function updateSegmentLengths() {
  const bounds = map.getBounds();
  const visibleSegments = spatialSegmentIndex
    .search({
      minX: bounds.getWest(),
      minY: bounds.getSouth(),
      maxX: bounds.getEast(),
      maxY: bounds.getNorth(),
    })
    .map((item) => item.feature);
  App.visibleSegmentLength = Math.trunc(
    visibleSegments.reduce((sum, feature) => sum + feature.properties.length, 0)
  );
  App.filteredSegmentLength = Math.trunc(
    visibleSegments.reduce((sum, feature) => {
      const slope = feature.properties.slope;
      if (slope < App.lowerThumbValue || slope > App.upperThumbValue) {
        return sum + feature.properties.length;
      }
      return sum;
    }, 0)
  );
}

map.on("load", async () => {
  map.touchZoomRotate.disableRotation();

  map.on("sourcedata", function waitForSource(e) {
    if (e.sourceId === "segments" && e.isSourceLoaded) {
      App.isReady = true;
      map.off("sourcedata", waitForSource);
    }
  });
  map.on("moveend", fetchContours);
  map.on("moveend", updateSegmentLengths);
  map.on("mousemove", "segments", (e) => {
    App.cursorX = e.point.x;
    App.cursorY = e.point.y;
    if (e.features.length > 0) {
      updateSlopePopup(e.features[0]);
    } else {
      hideSlopePopup();
    }
  });
  map.on("mouseleave", "segments", hideSlopePopup);
  if (!window.matchMedia("(hover: hover)").matches) {
    map.on("move", (_) => {
      const rect = map.getCanvas().getBoundingClientRect();
      App.cursorX = rect.left + rect.width / 2;
      App.cursorY = rect.top + rect.height / 2;
      const features = map.queryRenderedFeatures([App.cursorX, App.cursorY], {
        layers: ["segments"],
      });
      if (features.length > 0) {
        updateSlopePopup(features[0]);
      } else {
        hideSlopePopup();
      }
    });
  }

  const data = await (await fetch("datasets/segments.geojson")).json();
  initSpatialSegmentIndex(data.features);
  updateSegmentLengths();
  map.addSource("segments", { type: "geojson", data });
  map.addSource("selected-segment", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });
  map.addSource("contour", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });
  map.addSource("bezirke", {
    type: "geojson",
    data: "datasets/bezirke.geojson",
  });
  map.addSource("maptiler-labels", {
    type: "vector",
    url: "https://api.maptiler.com/tiles/v3/tiles.json?key=ud46ehKwd6sMnWr8iEjZ",
  });

  map.addLayer({
    id: "background",
    type: "background",
    paint: {
      "background-color": "white",
    },
  });
  map.addLayer({
    id: "contour",
    type: "line",
    source: "contour",
    minzoom: 15,
    paint: {
      "line-color": "rgba(0, 0, 0, 0.05)",
    },
  });
  map.addLayer({
    id: "contour-label",
    type: "symbol",
    source: "contour",
    minzoom: 17,
    layout: {
      "symbol-placement": "line",
      "text-field": ["to-string", ["round", ["get", "HOEHE_ADRIA"]]],
      "text-font": ["Open Sans Regular"],
      "text-size": 12,
    },
    paint: {
      "text-color": "rgba(0, 0, 0, 0.15)",
      "text-halo-color": "#fff",
      "text-halo-width": 10,
      "text-halo-blur": 0,
    },
  });
  map.addLayer({
    id: "segments",
    type: "line",
    source: "segments",
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        map.getMinZoom(),
        1.5,
        map.getMaxZoom(),
        100,
      ],
    },
  });
  map.addLayer({
    id: "selected-segment",
    type: "line",
    source: "selected-segment",
    paint: {
      "line-color": ["get", "color"],
      "line-width": [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        map.getMinZoom(),
        1.5,
        map.getMaxZoom(),
        100,
      ],
    },
  });
  map.addLayer({
    id: "selected-segment-line",
    type: "line",
    source: "selected-segment",
    paint: {
      "line-color": [
        "case",
        [">", ["get", "slope"], 0.1],
        "rgba(255,255,255,1)",
        "rgba(0,0,0,1)",
      ],
      "line-width": 1,
    },
  });
  const streetnames = await (await fetch("datasets/streetnames.json")).json();
  map.addLayer({
    id: "street-labels",
    type: "symbol",
    source: "maptiler-labels",
    "source-layer": "transportation_name",
    minzoom: 13.5,
    filter: ["match", ["get", "name"], streetnames, true, false],
    layout: {
      "text-field": ["get", "name"],
      "symbol-placement": "line",
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
    },
    paint: {
      "text-color": "#333",
      "text-halo-color": "#fff",
      "text-halo-width": 1,
    },
  });

  map.addLayer({
    id: "bezirke-label",
    type: "symbol",
    source: "bezirke",
    maxzoom: 13.5,
    layout: {
      "text-field": ["to-string", ["get", "NAME"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-anchor": "center",
    },
    paint: {
      "text-color": "#333",
      "text-halo-color": "#fff",
      "text-halo-width": 1,
    },
  });
});
