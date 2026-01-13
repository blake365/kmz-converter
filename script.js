const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const status = document.getElementById('status');
const selectedFileEl = document.getElementById('selectedFile');
const fileNameEl = document.getElementById('fileName');
const convertBtn = document.getElementById('convertBtn');

let selectedFile = null;

// Click to browse
dropZone.addEventListener('click', () => fileInput.click());

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        selectFile(e.target.files[0]);
    }
});

// Drag and drop events
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        selectFile(e.dataTransfer.files[0]);
    }
});

// Convert button click
convertBtn.addEventListener('click', () => {
    if (selectedFile) {
        handleFile(selectedFile);
    }
});

function updateStatus(message, type = '') {
    status.textContent = 'Status: ' + message;
    status.className = 'status' + (type ? ` ${type}` : '');
}

function selectFile(file) {
    const name = file.name.toLowerCase();

    if (!name.endsWith('.kmz') && !name.endsWith('.kml')) {
        updateStatus('Please select a .kmz or .kml file', 'error');
        selectedFile = null;
        selectedFileEl.classList.remove('visible');
        return;
    }

    selectedFile = file;
    fileNameEl.textContent = file.name;
    selectedFileEl.classList.add('visible');
    updateStatus('Ready to convert');
}

async function handleFile(file) {
    convertBtn.disabled = true;

    try {
        const name = file.name.toLowerCase();
        if (name.endsWith('.kmz')) {
            await processKMZ(file);
        } else {
            await processKML(file);
        }
    } catch (error) {
        console.error(error);
        updateStatus(`Error: ${error.message}`, 'error');
    }

    convertBtn.disabled = false;
}

async function processKMZ(file) {
    updateStatus('Unzipping KMZ...', 'processing');

    const zip = await JSZip.loadAsync(file);

    // Find the KML file inside the zip
    const kmlFileName = Object.keys(zip.files).find(name =>
        name.toLowerCase().endsWith('.kml')
    );

    if (!kmlFileName) {
        throw new Error('No KML file found inside KMZ');
    }

    const kmlText = await zip.files[kmlFileName].async('string');

    await parseAndConvert(kmlText, file.name.replace(/\.kmz$/i, '.csv'));
}

async function processKML(file) {
    updateStatus('Reading KML...', 'processing');

    const kmlText = await file.text();

    await parseAndConvert(kmlText, file.name.replace(/\.kml$/i, '.csv'));
}

async function parseAndConvert(kmlText, outputFilename) {
    updateStatus('Parsing KML...', 'processing');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'text/xml');

    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
        throw new Error('Invalid KML format');
    }

    const data = extractPlacemarks(xmlDoc);

    if (data.length === 0) {
        throw new Error('No placemarks found in file');
    }

    updateStatus(`Found ${data.length} coordinate${data.length === 1 ? '' : 's'}...`, 'processing');

    const csv = convertToCSV(data);
    downloadCSV(csv, outputFilename);

    updateStatus(`Done! Downloaded ${data.length} coordinate${data.length === 1 ? '' : 's'}`, 'success');
}

function extractPlacemarks(xmlDoc) {
    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    const results = [];
    let groupID = 0;

    for (const pm of placemarks) {
        const name = pm.querySelector('name')?.textContent?.trim() || '';
        const description = pm.querySelector('description')?.textContent?.trim() || '';

        // Handle Point
        const point = pm.querySelector('Point coordinates');
        if (point) {
            const coords = parseCoordinates(point.textContent);
            if (coords.length > 0) {
                results.push({
                    type: 'Point',
                    name,
                    description,
                    lat: coords[0].lat,
                    lon: coords[0].lon,
                    altitude: coords[0].alt,
                    groupID: groupID++,
                    vertexIndex: ''
                });
            }
        }

        // Handle LineString
        const lines = pm.querySelectorAll('LineString coordinates');
        for (const line of lines) {
            const coords = parseCoordinates(line.textContent);
            coords.forEach((coord, idx) => {
                results.push({
                    type: 'Line',
                    name,
                    description,
                    lat: coord.lat,
                    lon: coord.lon,
                    altitude: coord.alt,
                    groupID: groupID,
                    vertexIndex: idx
                });
            });
            if (coords.length > 0) groupID++;
        }

        // Handle Polygon (outer boundary)
        const polygons = pm.querySelectorAll('Polygon outerBoundaryIs LinearRing coordinates');
        for (const polygon of polygons) {
            const coords = parseCoordinates(polygon.textContent);
            coords.forEach((coord, idx) => {
                results.push({
                    type: 'Polygon',
                    name,
                    description,
                    lat: coord.lat,
                    lon: coord.lon,
                    altitude: coord.alt,
                    groupID: groupID,
                    vertexIndex: idx
                });
            });
            if (coords.length > 0) groupID++;
        }

        // Handle MultiGeometry
        const multiGeom = pm.querySelector('MultiGeometry');
        if (multiGeom) {
            // Points in MultiGeometry
            const mgPoints = multiGeom.querySelectorAll('Point coordinates');
            for (const pt of mgPoints) {
                const coords = parseCoordinates(pt.textContent);
                if (coords.length > 0) {
                    results.push({
                        type: 'Point',
                        name,
                        description,
                        lat: coords[0].lat,
                        lon: coords[0].lon,
                        altitude: coords[0].alt,
                        groupID: groupID++,
                        vertexIndex: ''
                    });
                }
            }

            // Lines in MultiGeometry
            const mgLines = multiGeom.querySelectorAll('LineString coordinates');
            for (const line of mgLines) {
                const coords = parseCoordinates(line.textContent);
                coords.forEach((coord, idx) => {
                    results.push({
                        type: 'Line',
                        name,
                        description,
                        lat: coord.lat,
                        lon: coord.lon,
                        altitude: coord.alt,
                        groupID: groupID,
                        vertexIndex: idx
                    });
                });
                if (coords.length > 0) groupID++;
            }

            // Polygons in MultiGeometry
            const mgPolygons = multiGeom.querySelectorAll('Polygon outerBoundaryIs LinearRing coordinates');
            for (const polygon of mgPolygons) {
                const coords = parseCoordinates(polygon.textContent);
                coords.forEach((coord, idx) => {
                    results.push({
                        type: 'Polygon',
                        name,
                        description,
                        lat: coord.lat,
                        lon: coord.lon,
                        altitude: coord.alt,
                        groupID: groupID,
                        vertexIndex: idx
                    });
                });
                if (coords.length > 0) groupID++;
            }
        }
    }

    return results;
}

function parseCoordinates(coordString) {
    if (!coordString) return [];

    // KML format: "lon,lat,alt lon,lat,alt" or "lon,lat lon,lat"
    // Coordinates are separated by whitespace, components by commas
    return coordString
        .trim()
        .split(/\s+/)
        .filter(s => s.length > 0)
        .map(coord => {
            const parts = coord.split(',').map(Number);
            return {
                lon: parts[0] || 0,
                lat: parts[1] || 0,
                alt: parts[2] || 0
            };
        })
        .filter(c => !isNaN(c.lat) && !isNaN(c.lon));
}

function convertToCSV(data) {
    const headers = ['Type', 'Name', 'Description', 'Latitude', 'Longitude', 'Altitude', 'GroupID', 'VertexIndex'];

    const rows = data.map(item => [
        item.type,
        escapeCSV(item.name),
        escapeCSV(item.description),
        item.lat,
        item.lon,
        item.altitude,
        item.groupID,
        item.vertexIndex
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function escapeCSV(str) {
    if (!str) return '';
    // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}
