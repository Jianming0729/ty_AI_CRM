# Identity Service API v1

## Base URL
`/v1/identity`

## 1. Resolve or Create
`POST /resolve-or-create`

**Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `provider` | string | Yes | e.g. `wecom`, `wechat` |
| `external_key` | string | Yes | The external user ID from the provider |
| `metadata` | object | No | Additional info to store on creation |
| `tenant_id` | string | No | Default: `default` |

**Response (200 OK):**
```json
{
  "ty_uid": "TYU_01JRS...",
  "source_id": "ty:TYU_01JRS...",
  "is_new_user": false,
  "resolved_via": "identities"
}
```

## 2. Link Identity
`POST /link`

**Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `ty_uid` | string | Yes | The target Tongye User ID |
| `provider` | string | Yes | New provider to link |
| `external_key` | string | Yes | External ID to bind |
| `is_verified` | boolean | No | Whether this identity is verified |

**Response (200 OK):**
```json
{
  "ok": true,
  "linked": { "provider": "wechat", "external_key": "..." }
}
```

**Response (409 Conflict):**
```json
{
  "error": "Identity conflict",
  "conflict_uid": "TYU_OTHER_ID"
}
```

## 3. Merge Users
`POST /merge`

**Request Body:**
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `from_uid` | string | Yes | The source ID to be merged |
| `to_uid` | string | Yes | The primary target ID |
| `reason` | string | No | Reason for merge |

## 4. Resolve Delivery Target
`POST /resolve-target`

**Request Body:**
| Field | Type | Required | Description |
| :--- | : :--- | :--- | :--- |
| `ty_uid` | string | Yes | Tongye User ID |
| `preferred_channels` | array | No | Priority order, e.g. `["wecom", "wechat"]` |
