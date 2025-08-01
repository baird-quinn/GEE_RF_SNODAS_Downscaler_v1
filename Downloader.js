//// Baird's pathetic attempt at developin an app, begun 7/25/2025, last updated 8/1/25
// Much of this stolen from Spatial Thoughts course (module 5): https://courses.spatialthoughts.com/end-to-end-gee.html#module-5-earth-engine-apps

// pallettes
var svis = {min:0, max: 4, palette: [ '3300ED','ffffff']}; // snow depth visibility, dark blue to white, may change to something more visible over satellite

// create a UI for date selection?
// create panel for widgets
var mainPanel = ui.Panel({style: {width: '600px'}});

var title = ui.Label({value: 'SNODAS-Based Snow Depth Predictor - Beta Version', style: {'fontSize': '18px'}});

var description = ui.Label({value: 'This is the first iteration of a SNODAS-based snow depth downscaler. It uses a coupled random forest to classify snow presence, then predict snow depth. Use with caution', style: {'fontSize': '14px'}});

// add info/widgets
mainPanel.add(title);
mainPanel.add(description);

var dropdownPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
});
mainPanel.add(dropdownPanel);

var yearSelector = ui.Select({
  placeholder: 'loading...',
  });

var monthSelector = ui.Select({
  placeholder: 'loading...',
  });
  
var daySelector = ui.Select({
  placeholder: 'loading...',
  });
  
var resolutionSelector = ui.Select({
  placeholder: 'loading...',
  });

var tileList = ['h003v004', 'h006v005', 'h007v005', 'h008v008', 'h010v009', 'h011v009', 'h010v010', 'h011v010'];

// Map of tile strings to their h and v values
var tileMap = {'h003v004': {h: 3, v: 4}, 'h006v005': {h: 6, v: 5}, 'h007v005': {h: 7, v: 5}, 'h008v008': {h: 8, v: 8}, 'h010v009': {h:10, v: 9}, 'h011v009': {h:11, v: 9}, 'h010v010': {h:10, v:10}, 'h011v010': {h:11, v:10}};

// Dropdown widget
var tileSelector = ui.Select({
  items: tileList,
  placeholder: 'Select a Landsat Tile',
});

var button = ui.Button('Load');
dropdownPanel.add(yearSelector);
dropdownPanel.add(monthSelector);
dropdownPanel.add(daySelector);
dropdownPanel.add(tileSelector);
dropdownPanel.add(resolutionSelector);
dropdownPanel.add(button);


// dropdown selectors
var years = ee.List.sequence(2003, 2025);
var months = ee.List.sequence(1, 12);
var days = ee.List.sequence(1, 31);
var resolution = ee.List([1000, 500, 250, 100, 50]);

// Dropdown Items
var yearStrings = years.map(function(year){
  return ee.Number(year).format('%04d');
});
var monthStrings = months.map(function(month){
  return ee.Number(month).format('%02d');
});

var dayStrings = days.map(function(day){
  return ee.Number(day).format('%02d');
});

var resolutionStrings = resolution.map(function(resolution){
  return ee.Number(resolution).format('%02d');
});

// var resolutionStrings = resolution.map(function(resolution){
//   return ee.Number(resolution).format('%02d');
// });

// Evaluate the results and populate the dropdown
yearStrings.evaluate(function(yearList) {
  yearSelector.items().reset(yearList);
  yearSelector.setPlaceholder('Select a Year');
});

monthStrings.evaluate(function(monthList) {
  monthSelector.items().reset(monthList);
  monthSelector.setPlaceholder('Select a Month');

});

dayStrings.evaluate(function(dayList) {
  daySelector.items().reset(dayList);
  daySelector.setPlaceholder('Select a Day');

});

resolutionStrings.evaluate(function(resolutionList) {
  resolutionSelector.items().reset(resolutionList);
  resolutionSelector.setPlaceholder('Select a Resolution');

});

// dropdown to delete previous layers if requested
var clearToggle = ui.Select({
  items: ['Clear Previous Layers', 'Keep Previous Layers'],
  value: 'Clear Previous Layers',
  style: {stretch: 'horizontal'}
});
mainPanel.add(clearToggle);


//// inspector
var inspectorPanel = ui.Panel({
  style: {width: '400px', maxHeight: '150px'}
});
mainPanel.add(ui.Label('Click on map to inspect predicted values:'));
mainPanel.add(inspectorPanel);

Map.onClick(function(coords) {
  inspectorPanel.clear();
  var point = ee.Geometry.Point(coords.lon, coords.lat);
  
  inspectorPanel.add(ui.Label(
    'Latitude: ' + coords.lat.toFixed(5) + ', Longitude: ' + coords.lon.toFixed(5)
  ));
  
  // List of layer names to inspect
  var layersToCheck = ['predicted snow depth'];
  
  var sample = Map.layers().map(function(layer) {
    var image = layer.getEeObject();
    return image.sample(point, 30).first().evaluate(function(result) {
      if (result) {
        inspectorPanel.add(ui.Label(layer.getName() + ': ' + result.properties.classification.toFixed(2)));
      }
    });
  });
});


//// discalimer
mainPanel.add(ui.Label({
  value: 'Disclaimer: Currently this is garbage; please do not use for analysis',
  style: {fontSize: '10px', color: 'gray'}
}));

// define global variables for export
var sd, roi, selectedResolution, year, month, day;

//// Run when click "Load", predict in selected landsat roi
var RF_SNO_prediction = function() {
  if (clearToggle.getValue() === 'Clear Previous Layers') { Map.layers().reset() ; }  // Clear all layers if toggled
  var dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation');
  var sno = ee.ImageCollection('projects/earthengine-legacy/assets/projects/climate-engine/snodas/daily');
  var slope = ee.Terrain.slope(dem);
  var aspect = ee.Terrain.aspect(dem).multiply(Math.PI/180);
  var tileId = tileSelector.getValue();
  var h = tileMap[tileId].h;
  var v = tileMap[tileId].v;
  roi = ee.FeatureCollection('projects/ee-baird-a-quinn/assets/geom/landsat2_conus').filter(ee.Filter.eq('h', h)).filter(ee.Filter.eq('v', v)).geometry();
  Map.centerObject(roi, 9);
  // var tilestyle = tile.style({color: 'red', fillColor: '00000000', width: 2});
  // Map.addLayer(tilestyle, {}, 'Selected Tile Boundary');
  var scfPath = 'projects/ee-baird-a-quinn/assets/SCF/Landsat_' + tileId + '_full_tile_all_WY1984-WY2024_thresh10_excL7_SPI_AprAug'; // incorrect projection I'm pretty sure currently
  var scf = ee.Image(scfPath).rename('scf');
  var relevPath = 'projects/ee-baird-a-quinn/assets/relev/' + tileId + '_1500';
  var relev = ee.Image(relevPath).rename('relev');
  var lk_maskPath = 'projects/ee-baird-a-quinn/assets/geom/water/lk_mask_' + tileId;
  var lk_mask = ee.Image(lk_maskPath);
  var nt = slope.multiply(aspect.cos()).rename('nt');
  var et = slope.multiply(aspect.sin()).rename('et');  
  var rf_c = ee.Classifier.load("projects/ee-baird-a-quinn/assets/RF/Classifier/sno_strat1c");
  var rf_r = ee.Classifier.load("projects/ee-baird-a-quinn/assets/RF/sno_strat1r");
  year = yearSelector.getValue();
  month = monthSelector.getValue();
  day = daySelector.getValue();
  var startDate = ee.Date.fromYMD(ee.Number.parse(year), ee.Number.parse(month), ee.Number.parse(day));
  var endDate = startDate.advance(1, 'day'); // needs advance at least one day
  var sno_input = ee.Image(sno.filter(ee.Filter.date(startDate, endDate)).first()).select('Snow_Depth').rename('sno').clip(roi).focal_mean({radius: 1500, units: 'meters'});  
  selectedResolution = parseInt(resolutionSelector.getValue(), 10); 
  var input = ee.Image.cat([sno_input, scf.rename('scf'), relev, et, nt]).clip(roi).updateMask(lk_mask).reproject({crs: 'EPSG:4326', scale: ee.Number(selectedResolution)});  
  var sp = input.classify(rf_c, "predicted snow presence");
  var sd_0 = input.classify(rf_r, "predicted snow depth").multiply(sp); // predict, multiply by classifier, mask 0s
  sd = sd_0.updateMask(sd_0.neq(0)); // predict, multiply by classifier, mask 0s
  var svis = {'min': 0, 'max': 4, palette: ['000000', '08306B', 'ffffff']}; // snow depth visibility, purpley blue to white
  var sd_name = 'Predicted Snow Depth (m) ' + year + '-' + month + '-' + day + ', ' + selectedResolution + ' m Resolution';
  Map.addLayer(sd, svis, sd_name);
  Map.setOptions('SATELLITE');
};
button.onClick(RF_SNO_prediction);

//// downloader
var exportButton = ui.Button({
  label: 'Export Predicted Snow Depth to Drive',
  style: {stretch: 'horizontal'},
  onClick: function() {
    if (!sd) {
      print('No image to export. Run the prediction first.');
      return;
    }

    Export.image.toDrive({
      image: sd,
      description: 'RF_Predicted_SnowDepth_' + year + '_' + month + '_' + day,
      folder: 'EarthEngineExports',
      fileNamePrefix: 'rf_snowdepth_' + year + '_' + month + '_' + day,
      region: roi,
      scale: selectedResolution,
      crs: 'EPSG:4326',
      maxPixels: 1e13
    });
    print('Export started to Google Drive.');
  }
});

mainPanel.add(exportButton);

ui.root.add(mainPanel);

