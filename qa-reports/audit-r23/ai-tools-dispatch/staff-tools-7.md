# Staff Tools (7) · dispatch detail · isStaff=True

Tested with `isStaff:true`, `tenantId:restaurant_dev`, `customerId:<Caleb>`. RequireText tools also retried with non-empty `text`.

## `staff_broadcast` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_broadcast",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 400

### Response
```json
{
  "detail": {
    "message": "tool staff_broadcast requires non-empty 'text' arg",
    "chip": "preciso de mais detalhes"
  }
}
```

### Retry (with non-empty text)
```json
{
  "name": "staff_broadcast",
  "silent": false,
  "requiresText": true,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "api_error",
      "message": "POST /staff/broadcasts → 404"
    }
  }
}
```

---

## `staff_assign_call` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_assign_call",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 200

### Response
```json
{
  "name": "staff_assign_call",
  "silent": true,
  "requiresText": false,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "bad_args"
    }
  }
}
```

---

## `staff_resolve_call` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_resolve_call",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 200

### Response
```json
{
  "name": "staff_resolve_call",
  "silent": false,
  "requiresText": false,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "missing_call_id"
    }
  }
}
```

---

## `staff_pause_zone` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_pause_zone",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 400

### Response
```json
{
  "detail": {
    "message": "tool staff_pause_zone requires non-empty 'text' arg",
    "chip": "preciso de mais detalhes"
  }
}
```

### Retry (with non-empty text)
```json
{
  "name": "staff_pause_zone",
  "silent": false,
  "requiresText": true,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "missing_waiter"
    }
  }
}
```

---

## `staff_mark_vip` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_mark_vip",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 200

### Response
```json
{
  "name": "staff_mark_vip",
  "silent": false,
  "requiresText": false,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "forbidden",
      "message": "só manager"
    }
  }
}
```

---

## `staff_respond_complaint` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_respond_complaint",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 400

### Response
```json
{
  "detail": {
    "message": "tool staff_respond_complaint requires non-empty 'text' arg",
    "chip": "preciso de mais detalhes"
  }
}
```

### Retry (with non-empty text)
```json
{
  "name": "staff_respond_complaint",
  "silent": false,
  "requiresText": true,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "api_error",
      "message": "POST /staff/complaints/00000000-0000-0000-0000-000000000000/messages → 404"
    }
  }
}
```

---

## `staff_resolve_complaint` (isStaff=true)

### Request (empty args)
```json
{
  "name": "staff_resolve_complaint",
  "args": {},
  "tenantId": "restaurant_dev",
  "customerId": "<caleb>",
  "isStaff": true
}
```

**HTTP**: 200

### Response
```json
{
  "name": "staff_resolve_complaint",
  "silent": false,
  "requiresText": false,
  "router": false,
  "result": {
    "message": null,
    "chips": [],
    "silent": false,
    "actionPayload": null,
    "routerTarget": null,
    "error": {
      "code": "missing_complaint_id"
    }
  }
}
```

---

