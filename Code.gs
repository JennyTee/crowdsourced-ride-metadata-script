/* 
Crowdsourced Ride Metadata Script
Version 1.0.0

Given a classId, pulls class metadata via the Peloton API and adds it to the corresponding 
row in the crowdsourced class data spreadsheet.
*/

// If needed, update these variables before running script:
const testMode = true;
const classIdColumn = 'A';
const firstColumnForMetadata = 'B';

// Do not update these variables
var spreadsheetId;
var instructorHashMap;
var classTypeHashMap;

if (testMode) {
  spreadsheetId = '12mMpTtizCh4l5sb9lO73CEo7ccqrWqD1GBjPggKY4xE';
} else {
  spreadsheetId ='';
}

function writeRowToSheet() {
  getMetadataMappings();

  // find first row that's not filled in
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheets()[0];
  var classIdRange = sheet.getRange(`${classIdColumn}${getFirstEmptyRowByColumnArray(ss)}`);
  
  // The row and column here are relative to the range
  var cell = classIdRange.getCell(1, 1);
  var cellValue = cell.getValue();
  
  // if classId field is empty, there are no more rows to parse; we are done here
  if (cellValue === null) {
    return;
  }

  var classId = parseClassId(cellValue);

  // query Reddit API to get class metadata
  var classInfo = getMatchingClassInfo(classId);


  // build metadata for sheet
  var dataForSheet = buildDataForSheet(classInfo);


  // write metadata to sheet
  const valueInputOption = 'USER_ENTERED';
  var valueRange = Sheets.newValueRange();
  valueRange.values = dataForSheet;
  var classMetadataRange = `${firstColumnForMetadata}${getFirstEmptyRowByColumnArray(ss)}`;
  var result = Sheets.Spreadsheets.Values.update(valueRange, spreadsheetId, classMetadataRange, {
    valueInputOption: valueInputOption
  });
}

function buildDataForSheet(classInfo) {
  const classType = getClassTypeName(classInfo.ride_type_id);
  const url = `https://members.onepeloton.com/classes/${classInfo.fitness_discipline}?modal=classDetailsModal&classId=${classInfo.id}`;

  var dataForSheet = [];
  dataForSheet.push([
    classInfo.title,
    classType,
    classInfo.instructor.name,
    classInfo.duration / 60,
    classInfo.language.charAt(0).toUpperCase() + classInfo.language.slice(1),
    classInfo.overall_rating_avg * 100,
    classInfo.difficulty_rating_avg,
    classInfo.id,
    url
  ]);

  return dataForSheet;
}

function parseClassId(cellValue) {
  const classIdRegEx = /classId=[0-9a-f]{32}/i;
  const workoutHistoryRegex = /workouts\/[0-9a-f]{32}/i;
  const guidRegEx = /[0-9a-f]{32}/i;
  
  let classIdString = cellValue.match(classIdRegEx);

  if (!!classIdString) {
    return classIdString[0].split('=')[1];
  }

  let workoutIdString = cellValue.match(workoutHistoryRegex);
  if (!!workoutIdString) {
    let workoutId = workoutIdString[0].split('/')[1];
    return getClassId(workoutId);
  }

  let guidString = cellValue.match(guidRegEx);
  if (!!guidString) {
    return guidString;
  } 

  console.log(`ERROR: classId not detected. Cell value: ${cellValue}`);
  return;
}

// When getting the classId, the API actually returns the class info too.
// Could refactor this later to use the ride info it gets here save an API call later...
// ...but leaving as-is for now to make it easier to maintain.
function getClassId(workoutId) {
  const url = `https://api.onepeloton.com/api/workout/${workoutId}`;
  let response = UrlFetchApp.fetch(url, {'muteHttpExceptions': true});
  let json = response.getContentText();
  let data = JSON.parse(json);

  return (!!data && !!data.ride) ? data.ride.id : null;
}

function getFirstEmptyRowByColumnArray(spr) {
  var column = spr.getRange(`${firstColumnForMetadata}:${firstColumnForMetadata}`);
  var values = column.getValues(); // get all data in one call
  var ct = 0;
  while ( values[ct] && values[ct][0] != "" ) {
    ct++;
  }
  return (ct + 1);
}

function getMatchingClassInfo(classId) {
  const url = `https://api.onepeloton.com/api/ride/${classId}/details`;
  let response = UrlFetchApp.fetch(url, {'muteHttpExceptions': true});
  let json = response.getContentText();
  let data = JSON.parse(json);

  return !!data ? data.ride : null;
}

function createTrigger() {
  // Check spreadsheet every 10 minutes to avoid unecessary Peloton API hits
  ScriptApp.newTrigger("writeRowToSheet")
           .timeBased().everyMinutes(1).create();
  Logger.log('Trigger created.');
}

function getMetadataMappings() {
  const url = 'https://api.onepeloton.com/api/ride/metadata_mappings';
  let response = UrlFetchApp.fetch(url, {'muteHttpExceptions': true});
  let json = response.getContentText();
  let data = JSON.parse(json);

  let instructorList = data.instructors;
  instructorHashMap = new Map(instructorList.map(i => [i.id, i]));

  let classTypeList = data.class_types;
  classTypeHashMap = new Map(classTypeList.map(ct => [ct.id, ct]));
}

function getMatchingClassInfo(classId) {
  const url = `https://api.onepeloton.com/api/ride/${classId}/details`;
  let response = UrlFetchApp.fetch(url, {'muteHttpExceptions': true});
  let json = response.getContentText();
  let data = JSON.parse(json);

  return !!data ? data.ride : null;
}

function getInstructorName(instructorId) {
  let instructor = instructorHashMap.get(instructorId);
  if (!!instructor) {
    if (!!instructor.last_name) {
      return `${instructor.first_name} ${instructor.last_name}`;
    } else {
    return `${instructor.first_name}`;
    }
  }
  return '';
}

function getClassTypeName(classTypeId) {
  let classType = classTypeHashMap.get(classTypeId);
  if (!!classType) {
    return classType.display_name;
  }

  return '';
}
