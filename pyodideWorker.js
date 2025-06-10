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
 * Execute code that doesn't contain input() calls
 */
async function executeCodeNormally(code) {
  try {
    const wrappedCode = `
import sys
from io import StringIO

# Redirect stdout to capture output
sys.stdout = mystdout = StringIO()

try:
    exec(${JSON.stringify(code)})
except Exception as e:
    print("Error:", e)

output = mystdout.getvalue()
`;

    await pyodide.runPythonAsync(wrappedCode);
    const output = pyodide.globals.get("output");
    self.postMessage({ type: "result", output });
  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
}

/**
 * Execute code with collected input values by replacing input() calls
 */
async function executeCodeWithInputs(code, inputs) {
  try {
    // Replace input() calls with actual values
    const modifiedCode = replaceInputCalls(code, inputs);
    
    const wrappedCode = `
import sys
from io import StringIO

# Redirect stdout to capture output
sys.stdout = mystdout = StringIO()

try:
    exec(${JSON.stringify(modifiedCode)})
except Exception as e:
    print("Error:", e)

output = mystdout.getvalue()
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
  
  // Replace each input() call with the corresponding input value
  const modifiedCode = code.replace(/input\s*\(\s*([^)]*)\s*\)/g, (match, promptArg) => {
    if (inputIndex < inputs.length) {
      const inputValue = inputs[inputIndex];
      inputIndex++;
      
      // Extract and print the prompt if it exists
      let prompt = promptArg.trim();
      if (prompt) {
        // Remove quotes if present
        if ((prompt.startsWith('"') && prompt.endsWith('"')) || 
            (prompt.startsWith("'") && prompt.endsWith("'"))) {
          prompt = prompt.slice(1, -1);
        }
        // Print the prompt and the input value (simulating interactive input)
        return `(print(${JSON.stringify(prompt)}, end="") or print(${JSON.stringify(inputValue)}) or ${JSON.stringify(inputValue)})`;
      } else {
        // No prompt, just print the input value
        return `(print(${JSON.stringify(inputValue)}) or ${JSON.stringify(inputValue)})`;
      }
    } else {
      // Fallback if we don't have enough inputs
      return '""';
    }
  });
  
  return modifiedCode;
}