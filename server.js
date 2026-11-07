const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

const users = {};
const posts = [];
const rooms = {};

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'الرجاء إدخال الاسم وكلمة المرور' });
    
    const userId = 'ID-' + Math.floor(100000 + Math.random() * 900000);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    users[userId] = { id: userId, username, password: hashedPassword };
    res.json({ success: true, user: { id: userId, username } });
});

app.post('/api/login', async (req, res) => {
    const { userId, password } = req.body;
    const user = users[userId];
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'الـ ID أو كلمة المرور غير صحيحة' });
    }
    res.json({ success: true, user: { id: user.id, username: user.username } });
});

app.get('/api/posts', (req, res) => {
    res.json(posts);
});

app.post('/api/posts', (req, res) => {
    const { userId, username, text, media } = req.body;
    const newPost = { id: Date.now(), userId, username, text: text || '', media: media || null, comments: [] };
    posts.unshift(newPost);
    io.emit('new-post-broadcast', posts);
    res.json({ success: true });
});

app.post('/api/comments', (req, res) => {
    const { postId, userId, username, text } = req.body;
    const post = posts.find(p => p.id == postId);
    if (post) {
        post.comments.push({ userId, username, text });
        io.emit('new-post-broadcast', posts);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'المنشور غير موجود' });
    }
});

io.on('connection', (socket) => {
    socket.on('join-room', ({ user, roomId }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                mics: { 1:{user:null,locked:false}, 2:{user:null,locked:false}, 3:{user:null,locked:false}, 4:{user:null,locked:false}, 5:{user:null,locked:false} }
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

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            rooms[roomId].users = rooms[roomId].users.filter(u => socket.id);
            io.to(roomId).emit('update-room-state', rooms[roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
