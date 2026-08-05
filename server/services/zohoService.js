import axios from 'axios';
import { getZohoAccessToken } from './zohoAuth.js';

const {
  ZOHO_OWNER_NAME,
  ZOHO_APP_NAME,
  ZOHO_FORM_NAME,
  ZOHO_REPORT_NAME,
} = process.env;

const ZOHO_API_BASE = `https://creator.zoho.com/api/v2/${ZOHO_OWNER_NAME}/${ZOHO_APP_NAME}`;

const isPlaceholderValue = (value) => {
  if (!value || typeof value !== 'string') {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.includes('your_') || normalized.includes('your ') || normalized.includes('placeholder');
};

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Converts the <input type="datetime-local"> value (e.g. "2026-08-05T15:21") into
// the "dd-MMM-yyyy HH:mm:ss" format Zoho Creator's date-time field requires.
const formatZohoDateTime = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || '');

  if (!match) {
    return value;
  }

  const [, year, month, day, hours, minutes, seconds = '00'] = match;
  const monthAbbreviation = MONTH_ABBREVIATIONS[Number(month) - 1];

  return `${day}-${monthAbbreviation}-${year} ${hours}:${minutes}:${seconds}`;
};

// Zoho Creator's Latitude/Longitude fields reject values over 16 significant
// digits, and raw GPS datasets often carry far more precision than that.
// 6 decimal places (~11cm accuracy) is more than enough for train tracking.
const roundCoordinate = (value) => Number(Number(value).toFixed(6));

const createZohoPayload = (payload) => {
  const { trainDetails, movementHistory = [] } = payload;

  return {
    data: [
      {
        train_number: trainDetails.trainNumber,
        train_name: trainDetails.trainName,
        Route_Name: trainDetails.routeName,
        Movement_History: movementHistory.map((row) => ({
          Current_Station: row.currentStation,
          Latitude: roundCoordinate(row.latitude),
          Longitude: roundCoordinate(row.longitude),
          Movement_Date_Time: formatZohoDateTime(row.movementDateTime),
          Current_Status: row.currentStatus || '',
          Remarks: row.remarks || '',
        })),
      },
    ],
  };
};

// Zoho Creator's add/update endpoints return HTTP 200 even when a record fails
// validation. The create (form POST) response nests failures inside a `result`
// array; the update (report PATCH) response puts `error` directly on the body.
// Check both shapes so a rejected save is never reported back as a success.
const assertZohoSuccess = (responseData) => {
  const results = Array.isArray(responseData?.result) ? responseData.result : [responseData];
  const failedResult = results.find((item) => item?.error);

  if (failedResult) {
    const error = new Error(
      Object.values(failedResult.error).join(' ') || 'Zoho Creator rejected the submitted data.',
    );
    error.statusCode = 422;
    error.response = { data: responseData };
    throw error;
  }
};

const requireZohoConfig = (...values) => {
  if (values.some((value) => isPlaceholderValue(value))) {
    const error = new Error(
      'Zoho configuration is incomplete. Update the .env file with the real Zoho owner name, app name, form name, and report name before continuing.',
    );
    error.statusCode = 400;
    throw error;
  }
};

const callZoho = async (request) => {
  try {
    const accessToken = await getZohoAccessToken();

    const response = await axios({
      ...request,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
        ...request.headers,
      },
    });

    return response.data;
  } catch (error) {
    const zohoError = new Error(
      error?.response?.data?.message || 'Zoho Creator request failed. Please verify your Zoho configuration.',
    );
    zohoError.statusCode = error?.response?.status || 500;
    zohoError.response = error?.response;
    throw zohoError;
  }
};

// Zoho's report API only returns subform rows as a flattened "display_value"
// string (no per-field keys), in the form's field order: Station, Latitude,
// Longitude, Status, Movement_Date_Time, row ID, Remarks, Added_Time.
const mapSubformRow = (row = {}) => {
  const parts = (row.display_value || '').split(',').map((part) => part.trim());

  if (parts.length < 6) {
    return {
      currentStation: '',
      latitude: '',
      longitude: '',
      movementDateTime: '',
      currentStatus: '',
      remarks: '',
    };
  }

  const [currentStation, latitude, longitude, currentStatus, movementDateTime] = parts;
  const remarks = parts.slice(6, -1).join(', ');

  return {
    currentStation,
    latitude,
    longitude,
    movementDateTime,
    currentStatus,
    remarks,
  };
};

const mapZohoRecord = (record = {}) => ({
  id: record.ID,
  trainNumber: record.train_number || '',
  trainName: record.train_name || '',
  routeName: record.Route_Name || '',
  movementHistory: (record.Movement_History || []).map(mapSubformRow),
});

export async function saveTrainToZoho(payload) {
  requireZohoConfig(ZOHO_OWNER_NAME, ZOHO_APP_NAME, ZOHO_FORM_NAME);

  const responseData = await callZoho({
    method: 'post',
    url: `${ZOHO_API_BASE}/form/${ZOHO_FORM_NAME}`,
    data: createZohoPayload(payload),
  });

  assertZohoSuccess(responseData);

  return responseData;
}

export async function listTrainsFromZoho() {
  requireZohoConfig(ZOHO_OWNER_NAME, ZOHO_APP_NAME, ZOHO_REPORT_NAME);

  const responseData = await callZoho({
    method: 'get',
    url: `${ZOHO_API_BASE}/report/${ZOHO_REPORT_NAME}`,
  });

  return (responseData?.data || []).map(mapZohoRecord);
}

export async function getTrainFromZoho(recordId) {
  requireZohoConfig(ZOHO_OWNER_NAME, ZOHO_APP_NAME, ZOHO_REPORT_NAME);

  const responseData = await callZoho({
    method: 'get',
    url: `${ZOHO_API_BASE}/report/${ZOHO_REPORT_NAME}/${recordId}`,
  });

  const record = Array.isArray(responseData?.data) ? responseData.data[0] : responseData?.data;

  if (!record) {
    const error = new Error('Train record not found.');
    error.statusCode = 404;
    throw error;
  }

  return mapZohoRecord(record);
}

export async function addMovementToZoho(recordId, row) {
  requireZohoConfig(ZOHO_OWNER_NAME, ZOHO_APP_NAME, ZOHO_REPORT_NAME);

  // The existing history comes back from Zoho as flattened display_value strings
  // (see mapSubformRow), so it's re-posted as-is alongside the new row rather
  // than round-tripping through numeric coercion that could lose precision.
  const existingTrain = await getTrainFromZoho(recordId);

  const mergedHistory = [
    ...existingTrain.movementHistory.map((existingRow) => ({
      Current_Station: existingRow.currentStation,
      Latitude: roundCoordinate(existingRow.latitude),
      Longitude: roundCoordinate(existingRow.longitude),
      Movement_Date_Time: existingRow.movementDateTime,
      Current_Status: existingRow.currentStatus,
      Remarks: existingRow.remarks,
    })),
    {
      Current_Station: row.currentStation,
      Latitude: roundCoordinate(row.latitude),
      Longitude: roundCoordinate(row.longitude),
      Movement_Date_Time: formatZohoDateTime(row.movementDateTime),
      Current_Status: row.currentStatus || '',
      Remarks: row.remarks || '',
    },
  ];

  const responseData = await callZoho({
    method: 'patch',
    url: `${ZOHO_API_BASE}/report/${ZOHO_REPORT_NAME}/${recordId}`,
    data: {
      data: {
        Movement_History: mergedHistory,
      },
    },
  });

  assertZohoSuccess(responseData);

  return responseData;
}
