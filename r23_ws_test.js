const io = require('socket.io-client');

const sock = io('http://localhost:3001', {
  extraHeaders: {
    'x-staff-key': 'dev-staff-api-key-change-in-prod',
    'x-staff-id': '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    'x-staff-role': 'manager',
    'x-tenant-slug': 'restaurant_dev',
  },
  auth: {
    staffKey: 'dev-staff-api-key-change-in-prod',
    staffId: '8bd06156-1fe5-4c18-a82d-43d38287ed4a',
    staffRole: 'manager',
    tenantSlug: 'restaurant_dev',
  },
});

sock.on('connect', () => {
  console.log(JSON.stringify({ step: 'connect', sid: sock.id }));
  sock.emit('join:tenant', { slug: 'restaurant_dev', role: 'manager' });
  sock.emit('join:tenant', { slug: 'restaurant_dev', role: 'waiter' });
  sock.emit('join:staff', { staffId: '8bd06156-1fe5-4c18-a82d-43d38287ed4a' });
  sock.emit('join:manager', { managerId: '8bd06156-1fe5-4c18-a82d-43d38287ed4a' });
});
sock.on('error', (e) => console.log(JSON.stringify({ step: 'error_emit', e })));
sock.on('connect_error', (e) =>
  console.log(JSON.stringify({ step: 'connect_error', msg: e.message })),
);
sock.on('disconnect', (r) => console.log(JSON.stringify({ step: 'disconnect', reason: r })));

// listen to many events
const events = [
  'waiter:call',
  'waiter:acknowledged',
  'order:new',
  'order:status',
  'order:ready',
  'order:claimed',
  'alert.created',
  'staff_message.received',
  'complaint.received',
  'complaint.responded',
  'late_arrival.created',
  'late_arrival.approved',
  'host.table_liberated',
  'host.swap_requested',
  'host.vip_flagged',
  'zone_pause.started',
  'session.flag_changed',
  'escalation.created',
];
events.forEach((ev) => sock.on(ev, (d) => console.log(JSON.stringify({ event: ev, payload: d }))));

setTimeout(() => {
  console.log(JSON.stringify({ step: 'exit' }));
  process.exit(0);
}, 15000);
