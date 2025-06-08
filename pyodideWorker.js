let pyodideReady = false;
let pyodide;

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
  self.postMessage({ type: "status", message: "Ready" });

  self.postMessage({ type: "Ready" }); // Ensure the ready event is triggered
}

loadPyodideAndPackages();


/**
 * Handles messages sent from the main thread (e.g., user-submitted Python code).
 */
self.onmessage = async (event) => {
  const code = event.data;

  // Ensure Pyodide is ready before attempting execution
  if (!pyodideReady) {
    self.postMessage({ type: "error", message: "Pyodide not ready yet." });
    return;
  }

  try {
    // Wrap user code execution within an output capturing mechanism
    const wrappedCode = `
import sys
from io import StringIO

# Redirect stdout to capture output from exec()
sys.stdout = mystdout = StringIO()

try:
    exec(${JSON.stringify(code)})  # Execute user-submitted Python code
except Exception as e:
    print("Error:", e)  # Catch execution errors and print them

output = mystdout.getvalue()  # Store captured output
`;

    // Run the wrapped Python code asynchronously using Pyodide
    await pyodide.runPythonAsync(wrappedCode);

    // Retrieve the output from the Python global namespace
    const output = pyodide.globals.get("output");

    // Send the execution result back to the main thread
    self.postMessage({ type: "result", output });
  } catch (err) {
    // Handle execution errors and notify the main thread
    self.postMessage({ type: "error", message: err.toString() });
  }
};
