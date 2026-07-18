const tf = require("@tensorflow/tfjs-node");
const fs = require("fs");
const path = require("path");

const MODEL_DIR = path.join(__dirname, "model");
const MODEL_PATH = path.join(MODEL_DIR, "model.json");
const METADATA_PATH = path.join(MODEL_DIR, "metadata.json");

// Mirrors the preprocessing done by @teachablemachine/image in the browser:
// center-crop to a square, resize to 224x224, then scale to [-1, 1].
function centerCrop(imageTensor) {
  const [height, width] = imageTensor.shape;
  const size = Math.min(height, width);
  const beginHeight = Math.floor((height - size) / 2);
  const beginWidth = Math.floor((width - size) / 2);
  return tf.slice(imageTensor, [beginHeight, beginWidth, 0], [size, size, 3]);
}

function imageToTensor(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const decoded = tf.node.decodeImage(imageBuffer, 3);
  const cropped = centerCrop(decoded);
  const resized = tf.image.resizeBilinear(cropped, [224, 224], true);
  const normalized = resized.toFloat().div(127.5).sub(1);
  return normalized.expandDims(0);
}

async function loadModel() {
  const model = await tf.loadLayersModel(`file://${MODEL_PATH}`);
  const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, "utf8"));
  return { model, labels: metadata.labels };
}

async function predict(imagePath) {
  const { model, labels } = await loadModel();
  const inputTensor = imageToTensor(imagePath);
  const output = model.predict(inputTensor);
  const probabilities = await output.data();

  tf.dispose([inputTensor, output]);

  return labels
    .map((className, i) => ({ className, probability: probabilities[i] }))
    .sort((a, b) => b.probability - a.probability);
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node predict.js <path-to-image>");
  process.exit(1);
}

predict(imagePath)
  .then((results) => {
    console.log("Predictions:");
    for (const { className, probability } of results) {
      console.log(`  ${className}: ${(probability * 100).toFixed(2)}%`);
    }
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
