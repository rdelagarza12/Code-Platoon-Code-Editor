/* main.js */

const EXECUTION_TIMEOUT = 10000;
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

let pyWorker = null;
let pyodideReady = false;
let pendingCode = null;
let timeoutId = null;
let startTime = null;

// Create and configure Pyodide Worker
function createPyWorker() {
  pyWorker = new Worker("/Code-Platoon-Code-Editor/pyodideWorker.js");
  pyodideReady = false;

  pyWorker.onmessage = (event) => {
    const { type, message, output, prompts } = event.data;

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

    if (type === "need_inputs") {
      clearTimeout(timeoutId); // Don't timeout while waiting for user input
      collectInputsAndExecute(prompts);
    }
  };
}

// Call once on page load
createPyWorker();

// Send code to worker
function sendCodeToWorker(code) {
  pyWorker.postMessage(code);
}

// Collect user inputs and resume execution
async function collectInputsAndExecute(prompts) {
  const inputs = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const userInput = window.prompt(prompt);
    inputs.push(userInput !== null ? userInput : "");
  }

  // Reset timeout after collecting input
  timeoutId = setTimeout(() => {
    outputEl.style.color = "red";
    outputEl.innerText = "Error: Execution timed out.";
    warningEl.innerText = `⚠️ Code execution was stopped after input. You might have an infinite loop.`;
    warningEl.style.display = "block";

    pyWorker.terminate();
    createPyWorker();
  }, EXECUTION_TIMEOUT);

  pyWorker.postMessage({
    type: "inputs_collected",
    inputs: inputs
  });
}

// Run Python button handler
function runPython() {
  outputEl.innerText = "Running...";
  outputEl.style.color = "#000";
  warningEl.style.display = "none";
  warningEl.innerText = "";
  startTime = Date.now();

  const code = editor.getValue();

  if (pyodideReady) {
    sendCodeToWorker(code);
  } else {
    pendingCode = code;
  }

  timeoutId = setTimeout(() => {
    outputEl.style.color = "red";
    outputEl.innerText = "Error: Execution timed out.";
    warningEl.innerText = `⚠️ Code execution was stopped after ${(EXECUTION_TIMEOUT / 1000).toFixed(1)} seconds. You might have an infinite loop.`;
    warningEl.style.display = "block";

    pyWorker.terminate();
    createPyWorker();
  }, EXECUTION_TIMEOUT);
}

// Reset button handler
function resetCode() {
  editor.setValue(typeof initial_code !== "undefined" ? initial_code : "");
  localStorage.removeItem(storageKey);
  outputEl.innerText = "";
  outputEl.style.color = "#000";
  warningEl.style.display = "none";
}
