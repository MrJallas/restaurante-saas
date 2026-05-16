const io = require('socket.io-client');
const sock = io('http://localhost:3001', {
  extraHeaders: {
    'x-staff-key': 'dev-staff-api-key-change-in-prod',
    'x-staff-id': '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    'x-tenant-slug': 'restaurant_dev'
  },
  auth: {
    staffKey: 'dev-staff-api-key-change-in-prod',
    staffId: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    tenantSlug: 'restaurant_dev'
  }
});
sock.on('connect', () => {
  console.log(JSON.stringify({step:'connect', sid:sock.id}));
  // Attempt cross-tenant join — should be rejected
  sock.emit('join:tenant', { slug: 'evil_other_tenant', role: 'manager' });
});
sock.on('error', e => console.log(JSON.stringify({step:'error_emit', e})));
sock.on('connect_error', e => console.log(JSON.stringify({step:'connect_error', msg: e.message})));
sock.on('disconnect', r => console.log(JSON.stringify({step:'disconnect', reason: r})));
setTimeout(() => { console.log(JSON.stringify({step:'exit'})); process.exit(0); }, 4000);
