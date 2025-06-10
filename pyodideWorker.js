let pyodideReady = false;
let pyodide;
let inputResolver = null;
let currentOutput = "";

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
  
  // Handle input responses from main thread
  if (typeof messageData === 'object' && messageData.type === "input_response") {
    if (inputResolver) {
      inputResolver(messageData.value);
      inputResolver = null;
    }
    return;
  }
  
  // Handle code execution (original string format)
  const code = typeof messageData === 'string' ? messageData : messageData.code;
  
  // Ensure Pyodide is ready
  if (!pyodideReady) {
    self.postMessage({ type: "error", message: "Pyodide not ready yet." });
    return;
  }

  try {
    // Set up custom input function in Python
    await pyodide.runPythonAsync(`
import sys
from io import StringIO

# Redirect stdout to capture output
sys.stdout = mystdout = StringIO()

# Store reference to original input for potential future use
_original_input = input

# Custom input function that requests input from main thread
def custom_input(prompt=""):
    """Custom input function that communicates with main thread"""
    import js
    
    # Get current output
    current_output = mystdout.getvalue()
    
    # Send input request to main thread
    js.postMessage({
        "type": "input_request",
        "prompt": str(prompt),
        "output": current_output
    })
    
    # This will be replaced by the actual implementation
    return "__PLACEHOLDER__"

# Replace built-in input with our custom function
input = custom_input
`);

    // Execute user code with input support
    await executeUserCode(code);

  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
};

/**
 * Execute user code with proper input handling
 */
async function executeUserCode(userCode) {
  try {
    // Check if code contains input() calls
    const hasInput = /input\s*\(/g.test(userCode);
    
    if (!hasInput) {
      // No input calls - execute normally
      await pyodide.runPythonAsync(`
try:
    exec(${JSON.stringify(userCode)})
except Exception as e:
    print("Error:", e)

output = mystdout.getvalue()
`);
      
      const output = pyodide.globals.get("output");
      self.postMessage({ type: "result", output });
      return;
    }

    // Code has input calls - handle them
    await executeCodeWithInput(userCode);
    
  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
}

/**
 * Execute code that contains input() calls
 */
async function executeCodeWithInput(userCode) {
  // Create a modified input function that works synchronously
  await pyodide.runPythonAsync(`
# List to store input values
_input_values = []
_input_index = 0

def sync_input(prompt=""):
    """Synchronous input function using pre-collected values"""
    global _input_index
    
    if _input_index < len(_input_values):
        value = _input_values[_input_index]
        _input_index += 1
        
        # Print the prompt and echo the input (like real input() does)
        if prompt:
            print(prompt, end="")
        print(value)
        
        return value
    else:
        return ""

# Replace input function
input = sync_input
`);

  // Parse and collect all input prompts
  const inputPrompts = extractInputPrompts(userCode);
  
  if (inputPrompts.length === 0) {
    // Fallback: execute with original input function
    await pyodide.runPythonAsync(`
try:
    exec(${JSON.stringify(userCode)})
except Exception as e:
    print("Error:", e)

output = mystdout.getvalue()
`);
    
    const output = pyodide.globals.get("output");
    self.postMessage({ type: "result", output });
    return;
  }

  // Collect all inputs from user
  const inputValues = [];
  for (const prompt of inputPrompts) {
    const value = await requestInput(prompt);
    inputValues.push(value);
  }

  // Set input values in Python and execute code
  pyodide.globals.set("collected_inputs", inputValues);
  
  await pyodide.runPythonAsync(`
# Set the collected input values
_input_values = collected_inputs
_input_index = 0

try:
    exec(${JSON.stringify(userCode)})
except Exception as e:
    print("Error:", e)

output = mystdout.getvalue()
`);

  const output = pyodide.globals.get("output");
  self.postMessage({ type: "result", output });
}

/**
 * Extract input prompts from user code
 */
function extractInputPrompts(code) {
  const prompts = [];
  
  // Simple regex to find input() calls
  // This handles: input(), input("prompt"), input('prompt')
  const inputRegex = /input\s*\(\s*([^)]*)\s*\)/g;
  let match;
  
  while ((match = inputRegex.exec(code)) !== null) {
    let prompt = match[1].trim();
    
    // Remove quotes if present
    if (prompt.startsWith('"') && prompt.endsWith('"')) {
      prompt = prompt.slice(1, -1);
    } else if (prompt.startsWith("'") && prompt.endsWith("'")) {
      prompt = prompt.slice(1, -1);
    }
    
    // Use empty string if no prompt
    prompts.push(prompt || "Enter input:");
  }
  
  return prompts;
}

/**
 * Request input from main thread
 */
function requestInput(prompt) {
  return new Promise((resolve) => {
    inputResolver = resolve;
    
    self.postMessage({
      type: "input_request",
      prompt: prompt,
      output: currentOutput
    });
  });
}