/* main.js */

const EXECUTION_TIMEOUT = 5000;
const storageKey = `exercise-code-${window.location.pathname}`;
const outputEl = document.getElementById("output");
const warningEl = document.getElementById("warning");

// Initialize CodeMirror
const editor = CodeMirror.fromTextArea(document.getElementById("code"), {
  mode: "python",
  lineNumbers: true,
  theme: "default",
  indentUnit: 4,
  tabSize: 4,
  lineWrapping: true,
  viewportMargin: Infinity
});

// Load saved code
const savedCode = localStorage.getItem(storageKey);
editor.setValue(savedCode !== null ? savedCode : (typeof initial_code !== "undefined" ? initial_code : ""));

// Auto-save on change
editor.on("change", () => {
  localStorage.setItem(storageKey, editor.getValue());
});

// Create and reuse a single Pyodide worker
let pyWorker = new Worker("rdelagarza12.github.io/learnworlds-ide/pyodideWorker.js");
let pyodideReady = false;
let pendingCode = null;

// Handle messages from the worker
pyWorker.onmessage = (event) => {
  const { type, message, output } = event.data;

  if (type === "ready") {
    pyodideReady = true;
    if (pendingCode !== null) {
      sendCodeToWorker(pendingCode);
      pendingCode = null;
    }
  }

  if (type === "result") {
    clearTimeout(timeoutId);
    outputEl.style.color = "#000";
    outputEl.innerText = output;
    warningEl.style.display = "none";
  }

  if (type === "error") {
    clearTimeout(timeoutId);
    outputEl.style.color = "red";
    outputEl.innerText = "Error: " + message;
    if (message.toLowerCase().includes("timeout")) {
      warningEl.innerText = "⚠️ Execution was stopped. You might have an infinite loop.";
      warningEl.style.display = "block";
    }
  }

  if (type === "status") {
    outputEl.innerText = message;
  }
};

let timeoutId;

function runPython() {
  outputEl.innerText = "Running...";
  outputEl.style.color = "#000";
  warningEl.style.display = "none";
  warningEl.innerText = "";

  const code = editor.getValue();

  if (pyodideReady) {
    sendCodeToWorker(code);
  } else {
    pendingCode = code;
  }


  // Set a timeout to prevent infinite loops
  outputEl.innerText = `Running... (max ${EXECUTION_TIMEOUT / 1000}s)`;
  timeoutId = setTimeout(() => {
    pyWorker.terminate();
    pyWorker = new Worker("/learnworlds-ide/pyodideWorker.js"); // Restart worker
    pyodideReady = false;
    outputEl.style.color = "red";
    outputEl.innerText = "Error: Execution timed out.";
    warningEl.innerText = "⚠️ Code execution was stopped after 3 seconds. You might have an infinite loop.";
    warningEl.style.display = "block";
  }, 5000);
}

function sendCodeToWorker(code) {
  pyWorker.postMessage(code);
}

// Reset button
function resetCode() {
  editor.setValue(typeof initial_code !== "undefined" ? initial_code : "");
  localStorage.removeItem(storageKey);
  outputEl.innerText = "";
  outputEl.style.color = "#000";
  warningEl.style.display = "none";
}
