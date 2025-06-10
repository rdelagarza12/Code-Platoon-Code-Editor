let pyodideReady = false;
let pyodide;
let currentOutput = ""; // Track accumulated output for input prompts

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

  self.postMessage({ type: "ready" }); // Ensure the ready event is triggered
}

loadPyodideAndPackages();

// Store the resolve function for pending input requests
let inputResolver = null;

/**
 * Custom input function that communicates with the main thread
 * This replaces Python's built-in input() function
 */
function createCustomInput() {
  return `
def custom_input(prompt=""):
    """
    Custom input function that requests input from the main thread
    """
    import js
    # Send input request to main thread with the prompt
    js.postMessage({
        "type": "input_requested", 
        "prompt": prompt,
        "output": mystdout.getvalue()  # Send current output
    })
    # Return a placeholder - the actual input will be injected
    return "__WAITING_FOR_INPUT__"

# Replace the built-in input function with our custom one
input = custom_input
`;
}

/**
 * Handles messages sent from the main thread
 */
self.onmessage = async (event) => {
  const messageData = event.data;
  
  // Handle input responses from the main thread
  if (messageData.type === "input_response") {
    if (inputResolver) {
      inputResolver(messageData.input);
      inputResolver = null;
    }
    return;
  }
  
  // Handle code execution requests
  if (messageData.type === "execute") {
    const code = messageData.code;
    
    // Ensure Pyodide is ready before attempting execution
    if (!pyodideReady) {
      self.postMessage({ type: "error", message: "Pyodide not ready yet." });
      return;
    }

    try {
      // Reset current output
      currentOutput = "";
      
      // Create a custom input handler that uses async communication
      const inputHandlerCode = `
import sys
from io import StringIO
import asyncio
import js

# Redirect stdout to capture output
sys.stdout = mystdout = StringIO()

# Store original input function
_original_input = input

# Custom input function that communicates with main thread
def async_input(prompt=""):
    """Async input function that requests input from main thread"""
    # Get current output to display
    current_output = mystdout.getvalue()
    
    # Send input request to main thread
    js.postMessage({
        "type": "input_requested",
        "prompt": str(prompt),
        "output": current_output
    })
    
    # Create a promise that will be resolved when input is received
    from js import Promise
    
    def create_promise(resolve, reject):
        # Store the resolve function globally so we can call it later
        js.self.inputResolver = resolve
    
    return Promise.new(create_promise)

# Override the input function
input = async_input
`;

      // First, set up the input handling system
      await pyodide.runPythonAsync(inputHandlerCode);
      
      // Now execute the user's code with proper input handling
      const wrappedCode = `
import sys
from io import StringIO
import asyncio
import js
from js import Promise

# The input function is already overridden from the previous setup

# Function to handle input requests
async def handle_input_request():
    """Handle a single input request"""
    return await Promise.new(lambda resolve, reject: setattr(js.self, 'currentInputResolver', resolve))

# Override input to work with our async system
def sync_input(prompt=""):
    """Synchronous input that works with our async system"""
    current_output = mystdout.getvalue()
    
    # Create a synchronous promise-like mechanism
    js.self.pendingInput = True
    js.self.inputPrompt = str(prompt)
    js.self.inputOutput = current_output
    
    # Send request to main thread
    js.postMessage({
        "type": "input_requested",
        "prompt": str(prompt),
        "output": current_output
    })
    
    # Return placeholder that will be replaced
    return "__INPUT_PLACEHOLDER__"

# Replace input function
input = sync_input

try:
    # Execute the user code
    ${JSON.stringify(code)}
except Exception as e:
    print("Error:", e)

# Get the final output
output = mystdout.getvalue()
`;

      // Execute the code and handle input requests
      await executeCodeWithInputHandling(wrappedCode);
      
    } catch (err) {
      self.postMessage({ type: "error", message: err.toString() });
    }
  }
};

/**
 * Execute code with proper input handling
 */
async function executeCodeWithInputHandling(wrappedCode) {
  try {
    // Split the code into lines to process input() calls
    const lines = wrappedCode.split('\n');
    let modifiedCode = lines.join('\n');
    
    // Check if the code contains input() calls
    const hasInputCalls = /input\s*\(/g.test(modifiedCode);
    
    if (hasInputCalls) {
      // Handle code with input() calls using a different approach
      await executeCodeWithInputPrompts(modifiedCode);
    } else {
      // Execute normally for code without input() calls
      await pyodide.runPythonAsync(modifiedCode);
      const output = pyodide.globals.get("output");
      self.postMessage({ type: "result", output });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err.toString() });
  }
}

/**
 * Execute code that contains input() calls by handling them sequentially
 */
async function executeCodeWithInputPrompts(code) {
  // Create a modified version of the code execution
  const setupCode = `
import sys
from io import StringIO

# Redirect stdout to capture output
sys.stdout = mystdout = StringIO()

# Create a list to store input values
_input_values = []
_input_index = 0

def mock_input(prompt=""):
    """Mock input function that uses pre-provided values"""
    global _input_index
    if _input_index < len(_input_values):
        value = _input_values[_input_index]
        _input_index += 1
        if prompt:
            print(prompt, end="")
        print(value)  # Echo the input
        return value
    else:
        return ""  # Return empty string if no more inputs

# Store original input
_original_input = input
input = mock_input
`;

  await pyodide.runPythonAsync(setupCode);
  
  // Extract and execute the user code with input simulation
  const userCodeExtraction = `
user_code = ${JSON.stringify(code)}
`;
  
  await pyodide.runPythonAsync(userCodeExtraction);
  
  // Now we need to parse the code and handle input() calls
  await handleInputsInCode();
}

/**
 * Handle input() calls in the user's code
 */
async function handleInputsInCode() {
  // Get the user's code
  const userCode = pyodide.globals.get("user_code");
  
  // Create a simple parser to find input() calls
  const inputRegex = /input\s*\(\s*([^)]*)\s*\)/g;
  let match;
  const inputCalls = [];
  
  while ((match = inputRegex.exec(userCode)) !== null) {
    const promptArg = match[1].trim();
    // Remove quotes if present
    const prompt = promptArg.replace(/^["']|["']$/g, '');
    inputCalls.push(prompt);
  }
  
  if (inputCalls.length === 0) {
    // No input calls found, execute normally
    await pyodide.runPythonAsync(`
try:
    exec(user_code)
except Exception as e:
    print("Error:", e)
output = mystdout.getvalue()
`);
    const output = pyodide.globals.get("output");
    self.postMessage({ type: "result", output });
    return;
  }
  
  // Collect all inputs first
  const inputValues = [];
  for (let i = 0; i < inputCalls.length; i++) {
    const inputValue = await requestInputFromMainThread(inputCalls[i]);
    inputValues.push(inputValue);
  }
  
  // Set the input values in Python
  pyodide.globals.set("input_values", inputValues);
  
  // Execute the code with the collected inputs
  await pyodide.runPythonAsync(`
_input_values = input_values
_input_index = 0

try:
    exec(user_code)
except Exception as e:
    print("Error:", e)

output = mystdout.getvalue()
`);
  
  const output = pyodide.globals.get("output");
  self.postMessage({ type: "result", output });
}

/**
 * Request input from the main thread and wait for response
 */
function requestInputFromMainThread(prompt) {
  return new Promise((resolve) => {
    // Store the resolver so we can call it when we get the response
    inputResolver = resolve;
    
    // Request input from main thread
    self.postMessage({
      type: "input_requested",
      prompt: prompt,
      output: currentOutput
    });
  });
}