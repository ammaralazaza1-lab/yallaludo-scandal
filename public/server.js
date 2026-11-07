const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// رفع حد استقبال البيانات لملفات الصوت والصور حتى 25 ميجابايت
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

const users = {};
const posts = [];
const rooms = {};

// إرسال واجهة المستخدم مباشرة من السيرفر لمنع أي أخطاء في الملفات
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>فضايا السودانيين على يلاليدو</title>
            <style>
                body { font-family: Tahoma, sans-serif; background: #0f172a; color: #fff; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: auto; background: #1e293b; padding: 20px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
                input, button { width: 100%; padding: 10px; margin: 8px 0; border-radius: 6px; border: none; box-sizing: border-box; }
                button { background: #38bdf8; color: #0f172a; font-weight: bold; cursor: pointer; }
                button:hover { background: #0ea5e9; }
                .hidden { display: none; }
                .mic-box { background: #334155; padding: 10px; margin: 5px 0; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
            </style>
        </head>
        <body>
        <div class="container" id="authSection">
            <h2>تسجيل الدخول / إنشاء حساب</h2>
            <input type="text" id="usernameInput" placeholder="اسم المستخدم">
            <input type="password" id="passwordInput" placeholder="كلمة المرور">
            <button onclick="register()">إنشاء حساب جديد</button>
            <button onclick="login()">تسجيل الدخول</button>
            <input type="text" id="loginIdInput" placeholder="أدخل الـ ID هنا عند تسجيل الدخول">
        </div>

        <div class="container hidden" id="mainSection">
            <h2>مرحباً، <span id="myUsername"></span> (<span id="myId"></span>)</h2>
            <h3>غرفة الدردشة والمايكات</h3>
            <input type="text" id="roomIdInput" placeholder="رقم الغرفة">
            <button onclick="joinRoom()">دخول الغرفة</button>

            <div id="roomArea" class="hidden">
                <h4>المايكات (5 مايكات تفاعلية)</h4>
                <div id="micsContainer"></div>

                <div style="background: #334155; padding: 10px; border-radius: 8px; margin-top: 15px;">
                    <h4 style="color: #38bdf8;">🎵 استديو الأغاني والموسيقى</h4>
                    <input type="file" id="songInput" accept="audio/*" onchange="uploadAndPlaySong()">
                    <audio id="roomAudioPlayer" controls style="width: 100%; display: none; margin-top: 5px;"></audio>
                </div>
            </div>
        </div>

        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io();
            let currentUser = null;
            let currentRoomId = null;

            async function register() {
                const username = document.getElementById('usernameInput').value;
                const password = document.getElementById('passwordInput').value;
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success) {
                    alert('تم إنشاء الحساب بنجاح! الـ ID الخاص بك هو: ' + data.user.id);
                    currentUser = data.user;
                    enterApp();
                } else { alert(data.error); }
            }

            async function login() {
                const userId = document.getElementById('loginIdInput').value;
                const password = document.getElementById('passwordInput').value;
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, password })
                });
                const data = await res.json();
                if (data.success) {
                    currentUser = data.user;
                    enterApp();
                } else { alert(data.error); }
            }

            function enterApp() {
                document.getElementById('authSection').classList.add('hidden');
                document.getElementById('mainSection').classList.remove('hidden');
                document.getElementById('myUsername').innerText = currentUser.username;
                document.getElementById('myId').innerText = currentUser.id;
            }

            function joinRoom() {
                currentRoomId = document.getElementById('roomIdInput').value;
                if (!currentRoomId) return alert('أدخل رقم الغرفة');
                socket.emit('join-room', { user: currentUser, roomId: currentRoomId });
                document.getElementById('roomArea').classList.remove('hidden');
            }

            socket.on('update-room-state', (room) => {
                const container = document.getElementById('micsContainer');
                container.innerHTML = '';
                for (let i = 1; i <= 5; i++) {
                    const mic = room.mics[i];
                    container.innerHTML += \`
                        <div class="mic-box">
                            <span>مايك \${i}: \${mic.user ? mic.user.username : (mic.locked ? '🔒 مغلق' : 'فارغ')}</span>
                            <div>
                                <button onclick="requestMic(\${i})" style="width:auto; padding:5px 10px;">تولّي</button>
                                <button onclick="toggleLock(\${i})" style="width:auto; padding:5px 10px; background:#e11d48; color:#fff;">قفل/فتح</button>
                            </div>
                        </div>
                    \`;
                }
            });

            function requestMic(micNum) {
                socket.emit('request-mic', { roomId: currentRoomId, micNum, user: currentUser });
            }

            function toggleLock(micNum) {
                socket.emit('toggle-lock', { roomId: currentRoomId, micNum });
            }

            function uploadAndPlaySong() {
                const file = document.getElementById('songInput').files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        socket.emit('play-song', { roomId: currentRoomId, songData: e.target.result });
                    };
                    reader.readAsDataURL(file);
                }
            }

            socket.on('play-room-song', (songData) => {
                const player = document.getElementById('roomAudioPlayer');
                player.src = songData;
                player.style.display = 'block';
                player.play().catch(err => console.log(err));
            });
        </script>
        </body>
        </html>
    `);
});

// APIs
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'الرجاء إدخال الاسم وكلمة المرور' });
    const userId = 'ID-' + Math.floor(100000 + Math.random() * 900000);
    const hashedPassword = await bcrypt.hash(password, 10);
    users[userId] = { id: userId, username, password: hashedPassword, avatar: 'https://via.placeholder.com/150' };
    res.json({ success: true, user: { id: userId, username, avatar: users[userId].avatar } });
});

app.post('/api/login', async (req, res) => {
    const { userId, password } = req.body;
    const user = users[userId];
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'الـ ID أو كلمة المرور غير صحيحة' });
    }
    res.json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar } });
});

// Socket.io
io.on('connection', (socket) => {
    socket.on('join-room', ({ user, roomId }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                mics: { 1:{user:null,locked:false}, 2:{user:null,locked:false}, 3:{user:null,locked:false}, 4:{user:null,locked:false}, 5:{user:null,locked:false} },
                currentSong: null
            };
        }
        if (!rooms[roomId].users.some(u => u.id === user.id)) {
            rooms[roomId].users.push(user);
        }
        io.to(roomId).emit('update-room-state', rooms[roomId]);
    });

    socket.on('request-mic', ({ roomId, micNum, user }) => {
        const room = rooms[roomId];
        if (room && !room.mics[micNum].locked) {
            for (let i = 1; i <= 5; i++) {
                if (room.mics[i].user && room.mics[i].user.id === user.id) {
                    room.mics[i].user = null;
                }
            }
            room.mics[micNum].user = user;
            io.to(roomId).emit('update-room-state', room);
        }
    });

    socket.on('toggle-lock', ({ roomId, micNum }) => {
        const room = rooms[roomId];
        if (room) {
            room.mics[micNum].locked = !room.mics[micNum].locked;
            if (room.mics[micNum].locked) room.mics[micNum].user = null;
            io.to(roomId).emit('update-room-state', room);
        }
    });

    socket.on('play-song', ({ roomId, songData }) => {
        const room = rooms[roomId];
        if (room) {
            room.currentSong = songData;
            io.to(roomId).emit('play-room-song', songData);
        }
    });

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            rooms[roomId].users = rooms[roomId].users.filter(u => socket.id);
            io.to(roomId).emit('update-room-state', rooms[roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
