from flask import Flask, request
import requests
from threading import Thread, Event
import time
import itertools  # For cycling through haternames

app = Flask(__name__)
app.debug = True

headers = {
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 11; TECNO CE7j) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.40 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.9',
    'referer': 'www.google.com'
}

stop_event = Event()
threads = []

@app.route('/ping', methods=['GET'])
def ping():
    return "✅ I am alive!", 200

def send_messages(access_Cookies, thread_id, time_interval, messages, haternames):
    hatername_cycle = itertools.cycle(haternames)  # Cycle through haternames
    while not stop_event.is_set():
        try:
            for message1 in messages:
                if stop_event.is_set():
                    break
                for access_cookie in access_cookies:
                    mn = next(hatername_cycle)  # Get next hatername
                    api_url = f'https://graph.facebook.com/v15.0/t_{thread_id}/'
                    message = f"{mn} {message1}"
                    parameters = {'access_token': access_Cookies, 'message': message}
                    response = requests.post(api_url, data=parameters, headers=headers)
                    if response.status_code == 200:
                        print(f"✅ Sent: {message[:30]} via {access_Cookie[:10]}")
                    else:
                        print(f"❌ Fail [{response.status_code}]: {message[:30]}")
                    time.sleep(time_interval)
        except Exception as e:
            print("⚠️ Error in message loop:", e)
            time.sleep(10)

@app.route('/', methods=['GET', 'POST'])
def send_message():
    global threads
    if request.method == 'POST':
        Cookies_file = request.files['tokenFile']
        access_cookies = Cookies_file.read().decode().strip().splitlines()

        thread_id = request.form.get('threadId')
        time_interval = int(request.form.get('time'))

        txt_file = request.files['txtFile']
        messages = txt_file.read().decode().splitlines()

        # Read haternames from textarea
        haternames = request.form.get('haternames').strip().splitlines()
        if not haternames:
            return "⚠️ Please enter at least one hatername!", 400

        if not any(thread.is_alive() for thread in threads):
            stop_event.clear()
            thread = Thread(target=send_messages, args=(access_Cookies, thread_id, time_interval, messages, haternames))
            thread.start()
            threads = [thread]

    return '''
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vampire RuLex Ayansh</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    label {
      color: white;
    }
    .file {
      height: 30px;
    }
    body {
      background-image: url('https://i.postimg.cc/fTS3mBYR/IMG-20250730-WA0032.jpg');
      background-size: cover;
      background-repeat: no-repeat;
      color: white;
    }
    .container {
      max-width: 350px;
      height: 650px; /* Increased height to accommodate textarea */
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 0 15px white;
      border: none;
    }
    .form-control, textarea.form-control {
      border: 1px double white;
      background: transparent;
      width: 100%;
      padding: 7px;
      margin-bottom: 20px;
      border-radius: 10px;
      color: white;
    }
    textarea.form-control {
      height: 100px; /* Adjust height for textarea */
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
    }
    .neon-text {
      font-size: 2.5em;
      font-family: Arial, sans-serif;
      color: #ff00ff;
      text-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff;
      animation: flicker 1.5s infinite alternate;
    }
    @keyframes flicker {
      0% { text-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff; }
      100% { text-shadow: 0 0 5px #ff00ff, 0 0 15px #ff00ff, 0 0 25px #ff00ff; }
    }
    .neon-btn {
      background-color: #ff00ff;
      border: none;
      color: white;
      padding: 10px 20px;
      text-align: center;
      text-decoration: none;
      display: inline-block;
      font-size: 16px;
      margin-top: 10px;
      border-radius: 10px;
      box-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff;
      transition: all 0.3s ease;
    }
    .neon-btn:hover {
      box-shadow: 0 0 5px #ff00ff, 0 0 15px #ff00ff, 0 0 25px #ff00ff;
      transform: scale(1.05);
    }
    .btn-submit {
      width: 100%;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      color: #888;
    }
    .neon-footer {
      font-size: 1.2em;
      color: #ff00ff;
      text-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff;
      animation: flicker 1.5s infinite alternate;
    }
    .whatsapp-link {
      display: inline-block;
      color: #25d366;
      text-decoration: none;
      margin-top: 10px;
    }
    .whatsapp-link i {
      margin-right: 5px;
    }
  </style>
</head>
<body>
  <header class="header mt-4">
    <h1 class="neon-text">𝐕𝐀𝐌𝐏𝐈𝐑𝐄 𝐑𝐔𝐋𝐄𝐗</h1>
  </header>
  <div class="container text-center">
    <form method="post" enctype="multipart/form-data">
      <label>Cookies File</label><input type="file" name="cookieFile" class="form-control" required>
      <label>Thread/Inbox ID</label><input type="text" name="threadId" class="form-control" required>
      <label>Haternames (one per line)</label><textarea name="haternames" class="form-control" rows="4" placeholder="Enter haternames, one per line" required></textarea>
      <label>Delay (seconds)</label><input type="number" name="time" class="form-control" required>
      <label>Text File</label><input type="file" name="txtFile" class="form-control" required>
      <button type="submit" class="btn neon-btn btn-submit">Start Sending</button>
    </form>
    <form method="post" action="/stop">
      <button type="submit" class="btn neon-btn btn-submit mt-3">Stop Sending</button>
    form>
  </div>
  <footer class="footer">
    <p>© 𝟮𝟬𝟮𝟮 𝐑𝐀𝐉𝐕𝐄𝐄𝐑 𝐈𝐍𝐒𝐈𝐃𝐄 </p>
    <p><a href="https://www.facebook.com/profile.php?id=61556348353228">ᴄʟɪᴄᴋ ʜᴇʀᴇ ғᴏʀ ғᴀᴄᴀʙᴏᴏᴋ</a></p>
    <div class="mb-3">
      <a href="" class="whatsapp-link">
        <i class="fab fa-whatsapp"></i> Chat on WhatsApp
   z   </a>
    </div>
  </footer>
</body>
</html>
    '''

@app.route('/stop', methods=['POST'])
def stop_sending():
    stop_event.set()
    return 'Message sending stopped.'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
