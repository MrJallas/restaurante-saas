const io = require('socket.io-client');
const sock = io('http://localhost:3001'); // no auth at all
sock.on('connect', () => console.log(JSON.stringify({step:'connect', sid:sock.id})));
sock.on('error', e => console.log(JSON.stringify({step:'error_emit', e})));
sock.on('connect_error', e => console.log(JSON.stringify({step:'connect_error', msg: e.message})));
sock.on('disconnect', r => console.log(JSON.stringify({step:'disconnect', reason: r})));
setTimeout(() => { console.log(JSON.stringify({step:'exit'})); process.exit(0); }, 5000);
