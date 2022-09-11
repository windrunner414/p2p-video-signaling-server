const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {origin: '*'},
});

const rooms = new Map();
const connections = new Map();

function createRoom(name, password) {
    const room = {
        name: name,
        password: password,
        callee: null, // who create the room
        caller: null, // who join the room
    };
    rooms.set(name, room);
    return room;
}

function getPeerSocket(selfSocket) {
    const connection = connections.get(selfSocket.id);
    if (!connection) {
        return null;
    }
    const room = rooms.get(connection.roomName);
    if (!room) {
        return null;
    }
    if (room.callee.id === selfSocket.id) {
        return room.caller;
    } else if (room.caller.id === selfSocket.id) {
        return room.callee;
    } else {
        return null;
    }
}

app.all('*', (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    next();
});

app.get('/', (req, res) => {
    res.send('hello world');
});

io.on('connection', (socket) => {
    console.log(`connected: ${socket.id}`);

    socket.on('join', (args) => {
        if (!args
            || typeof args['roomName'] != 'string'
            || typeof args['password'] != 'string'
            || args['roomName'].length > 30
            || args['password'].length > 30) {
            io.to(socket.id).emit('operationFailed', 'invalid arguments');
            return;
        }

        const roomName = args['roomName'];
        let room = rooms.get(roomName);
        if (!room) {
            room = createRoom(roomName, args['password']);
            room.callee = socket;
            io.to(socket.id).emit('roomCreated');
        } else {
            if (room.password !== args['password']) {
                io.to(socket.id).emit('operationFailed', 'wrong password');
                return;
            }
            if (room.caller) {
                io.to(socket.id).emit('operationFailed', 'line busy');
                return;
            }
            room.caller = socket;
            io.to(socket.id).emit('roomJoined');
        }
        connections.set(socket.id, {roomName: roomName});
    });

    socket.on('disconnect', (reason) => {
        console.log(`disconnected: ${socket.id}`);

        const peer = getPeerSocket(socket);
        if (peer) {
            peer.disconnect(true);
        }

        const connection = connections.get(socket.id);
        if (!connection) {
            return;
        }
        connections.delete(socket.id);
        rooms.delete(connection.roomName);
    });

    socket.on('sendSessionDescription', (description) => {
        const peer = getPeerSocket(socket);
        if (!peer) {
            io.to(socket.id).emit('operationFailed', 'no peer');
            return;
        }
        io.to(peer.id).emit('sessionDescription', description);
    });

    socket.on('sendIceCandidate', (candidate) => {
        const peer = getPeerSocket(socket);
        if (!peer) {
            io.to(socket.id).emit('operationFailed', 'no peer');
            return;
        }
        io.to(peer.id).emit('iceCandidate', candidate);
    });
});

server.listen(3000, () => {
    console.log('listening on *:3000');
});
