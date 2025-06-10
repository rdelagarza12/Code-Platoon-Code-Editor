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

// Create and reuse a single Pyodide worker
let pyWorker = null;
let pyodideReady = false;
let pendingCode = null;
let timeoutId = null;
let startTime = null;

// Create a new worker and set up listeners
function createPyWorker() {
  pyWorker = new Worker("/learnworlds-ide/pyodideWorker.js");
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
      clearTimeout(timeoutId); // Don't timeout during user input
      collectInputsAndExecute(prompts);
    }
  };
}

// Call it once on initial load
createPyWorker();

// Function to collect all inputs from user and send back to worker
async function collectInputsAndExecute(prompts) {
  const inputs = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const userInput = window.prompt(prompt);
    inputs.push(userInput !== null ? userInput : "");
  }

  // Reset timeout AFTER inputs collected
  timeoutId = setTimeout(() => {
    outputEl.style.color = "red";
    outputEl.innerText = "Error: Execution timed out.";
    warningEl.innerText = `⚠️ Code execution was stopped after input. You might have an infinite loop.`;
    warningEl.style.display = "block";

    pyWorker.terminate();
    createPyWorker();
  }, EXECUTION_TIMEOUT);

  // Send inputs back to worker
  pyWorker.postMessage({
    type: "inputs_collected",
    inputs: inputs
  });
}


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

  // Set a timeout to prevent infinite loops
  timeoutId = setTimeout(() => {
    outputEl.style.color = "red";
    outputEl.innerText = "Error: Execution timed out.";
    warningEl.innerText = `⚠️ Code execution was stopped after ${(EXECUTION_TIMEOUT / 1000).toFixed(1)} seconds. You might have an infinite loop.`;
    warningEl.style.display = "block";

    // Recreate worker for next run
    pyWorker.terminate();
    createPyWorker();
  }, EXECUTION_TIMEOUT);
}

function sendCodeToWorker(code) {
  pyWorker.postMessage(code);
}

