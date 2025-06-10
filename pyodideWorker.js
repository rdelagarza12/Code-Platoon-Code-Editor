let pyodideReady = false;
let pyodide;
let pendingCode = null;

async function loadPyodideAndPackages() {
  self.postMessage({ type: "status", message: "Loading Pyodide..." });

  // Load Pyodide from CDN
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.18.1/full/pyodide.js");

  // Initialize Pyodide
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.18.1/full/"
  });

  // Mark Pyodide as ready
  pyodideReady = true;

  // Send status update
  self.postMessage({ type: "status", message: "ready" });
  self.postMessage({ type: "ready" });
}

loadPyodideAndPackages();

/**
 * Handles messages sent from the main thread
 */
self.onmessage = async (event) => {
  const messageData = event.data;
  
  // Handle collected inputs from main thread
  if (typeof messageData === 'object' && messageData.type === "inputs_collected") {
    if (pendingCode) {
      await executeCodeWithInputs(pendingCode, messageData.inputs);
      pendingCode = null;
    }
    return;
  }
  
  // Handle code execution request
  const code = typeof messageData === 'string' ? messageData : messageData.code;
  
  // Ensure Pyodide is ready
  if (!pyodideReady) {
    self.postMessage({ type: "error", message: "Pyodide not ready yet." });
    return;
  }

  try {
    // Check if code contains input() calls
    const inputPrompts = extractInputPrompts(code);
    
    if (inputPrompts.length > 0) {
      // Code has input() calls - request inputs from main thread
      pendingCode = code;
      self.postMessage({
        type: "need_inputs",
        prompts: inputPrompts
      });
    } else {
      // No input() calls - execute directly
      await executeCodeNormally(code);
    }

  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
};

/**
 * Execute code without input() calls
 */
async function executeCodeNormally(code) {
  try {
    const wrappedCode = `
import sys
import traceback
from io import StringIO

# Redirect stdout and stderr
sys.stdout = mystdout = StringIO()
sys.stderr = mystderr = StringIO()

try:
    exec(${JSON.stringify(code)})
except Exception:
    traceback.print_exc()

output = mystdout.getvalue() + mystderr.getvalue()
`;

    await pyodide.runPythonAsync(wrappedCode);
    const output = pyodide.globals.get("output");
    self.postMessage({ type: "result", output });
  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
}

/**
 * Execute code with collected input values
 */
async function executeCodeWithInputs(code, inputs) {
  try {
    const modifiedCode = replaceInputCalls(code, inputs);
    
    const wrappedCode = `
import sys
import traceback
from io import StringIO

# Redirect stdout and stderr
sys.stdout = mystdout = StringIO()
sys.stderr = mystderr = StringIO()

try:
    exec(${JSON.stringify(modifiedCode)})
except Exception:
    traceback.print_exc()

output = mystdout.getvalue() + mystderr.getvalue()
`;

    await pyodide.runPythonAsync(wrappedCode);
    const output = pyodide.globals.get("output");
    self.postMessage({ type: "result", output });
  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
}


/**
 * Extract input prompts from code
 */
function extractInputPrompts(code) {
  const prompts = [];
  
  // Find all input() calls using regex
  const inputRegex = /input\s*\(\s*([^)]*)\s*\)/g;
  let match;
  
  while ((match = inputRegex.exec(code)) !== null) {
    let prompt = match[1].trim();
    
    // Handle different quote types and empty prompts
    if (prompt) {
      // Remove outer quotes if present
      if ((prompt.startsWith('"') && prompt.endsWith('"')) || 
          (prompt.startsWith("'") && prompt.endsWith("'"))) {
        prompt = prompt.slice(1, -1);
      }
      prompts.push(prompt);
    } else {
      prompts.push("Enter input:");
    }
  }
  
  return prompts;
}

/**
 * Replace input() calls in code with actual string values
 */
function replaceInputCalls(code, inputs) {
  let inputIndex = 0;

  return code.replace(/input\s*\(\s*([^)]*)\s*\)/g, (match, promptArg) => {
    if (inputIndex >= inputs.length) {
      // If we run out of inputs, simulate an empty string
      return '""';
    }

    const inputValue = inputs[inputIndex++];
    let prompt = promptArg.trim();

    if (prompt) {
      // Remove wrapping quotes from prompt if present
      if ((prompt.startsWith('"') && prompt.endsWith('"')) ||
          (prompt.startsWith("'") && prompt.endsWith("'"))) {
        prompt = prompt.slice(1, -1);
      }

      // Print the prompt only; input value is returned silently
      return `(print(${JSON.stringify(prompt + " ")}, end="") or ${JSON.stringify(inputValue)})`;
    }

    // No prompt — just return the value
    return JSON.stringify(inputValue);
  });
}
