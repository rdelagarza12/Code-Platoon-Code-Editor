// Initialize CodeMirror on the textarea.
const editor = CodeMirror.fromTextArea(document.getElementById("codeEditor"), {
  lineNumbers: true,
  mode: "python",
  theme: "monokai"
});
editor.setSize("100%", "300px");

// Function to submit the code to Judge0 for execution.
async function submitCode() {
  const userCode = editor.getValue(); // Capture the code from CodeMirror
  const payload = {
    source_code: userCode,
    language_id: 71, // Python 3 language id.
    stdin: ""       // Optional: Provide input data if needed.
  };

  try {
    // Removed the wait parameter to avoid errors.
    const submissionResponse = await axios.post(
      "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false",
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY',   // Replace with your API key
          'x-rapidapi-host': 'YOUR_RAPIDAPI_HOST'    // Replace with your API host
        }
      }
    );
    
    const token = submissionResponse.data.token;
    console.log("Submission Token:", token);
    // Start polling for the result using the received token.
    pollForResult(token);
  } catch (error) {
    console.error("Error submitting the code:", error);
    document.getElementById("output").innerText = `Submission error: ${error.message}`;
  }
}

// Function to poll Judge0 for the submission result.
async function pollForResult(token) {
  const pollUrl = `https://judge0-ce.p.rapidapi.com/submissions/${token}?base64_encoded=false`;
  const pollInterval = 2000;  // Poll every 2 seconds
  
  const poll = setInterval(async () => {
    try {
      const resultResponse = await axios.get(pollUrl, {
        headers: {
          'x-rapidapi-key': 'YOUR_RAPIDAPI_KEY',
          'x-rapidapi-host': 'YOUR_RAPIDAPI_HOST'
        }
      });
      const resultData = resultResponse.data;

      // Judge0 status.id: (1-2: Pending/Processing, 3+: Complete)
      if (resultData.status.id >= 3) {
        clearInterval(poll);
        console.log("Execution Result:", resultData);
        // Show stdout if available; otherwise, show stderr or fallback message.
        document.getElementById("output").innerText = resultData.stdout || resultData.stderr || "No output available.";
      }
    } catch (err) {
      console.error("Error polling for result:", err);
      clearInterval(poll);
      document.getElementById("output").innerText = `Polling error: ${err.message}`;
    }
  }, pollInterval);
}

// Attach the event listener to run the code when the button is clicked.
document.getElementById("runCodeButton").addEventListener("click", submitCode);