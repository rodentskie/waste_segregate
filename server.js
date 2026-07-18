const http = require("http");
const fs = require("fs");
const path = require("path");
const { SerialPort } = require("serialport");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".bin": "application/octet-stream",
};

// Maps the model's class names to the byte sent to the Arduino.
const CLASS_TO_SIGNAL = {
  Recyclable: "a",
  "Non-Recyclable": "b",
};

const arduinoPort = new SerialPort(
  {
    path: process.env.ARDUINO_PORT || "/dev/ttyUSB0",
    baudRate: Number(process.env.ARDUINO_BAUD) || 9600,
  },
  (err) => {
    if (err) {
      console.warn(`Could not open Arduino serial port: ${err.message}`);
    }
  }
);

arduinoPort.on("error", (err) => {
  console.warn(`Serial port error: ${err.message}`);
});

let lastClassName = null;

function sendToArduino(className) {
  if (className === lastClassName) return;
  lastClassName = className;

  const signal = CLASS_TO_SIGNAL[className];
  if (!signal) {
    console.warn(`Unknown class "${className}", nothing sent to Arduino.`);
    return;
  }

  if (!arduinoPort.isOpen) {
    console.warn(`Serial port not open, skipping write for "${className}".`);
    return;
  }

  arduinoPort.write(signal, (err) => {
    if (err) console.warn(`Failed to write to Arduino: ${err.message}`);
    else console.log(`Sent "${signal}" to Arduino for class "${className}".`);
  });
}

function handleClassify(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    try {
      const { className } = JSON.parse(body);
      sendToArduino(className);
      res.writeHead(204);
      res.end();
    } catch (err) {
      res.writeHead(400);
      res.end("Invalid request body");
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/classify") {
    handleClassify(req, res);
    return;
  }

  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(ROOT, decodeURIComponent(urlPath.split("?")[0]));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Serving at http://localhost:${PORT}`);
});
