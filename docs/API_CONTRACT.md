# RecallAI API Contract (v1.0)

> **Single Source of Truth**: Any modifications to this contract require explicit discussion and user approval.

## Base URL
Default local development base URL: `http://127.0.0.1:8000`

---

## Endpoints

### 1. Health Check
- **Path**: `GET /health`
- **Description**: Verifies database connectivity, checks LLM credential configuration, and reports Supabase history status. Does **not** invoke paid LLM calls and never exposes secrets.
- **Responses**:
  - **200 OK** (database connected):
    ```json
    {
      "status": "ok",
      "database": "connected",
      "llm_configured": true,
      "supabase": "connected"
    }
    ```
  - **503 Service Unavailable** (database down):
    ```json
    {
      "status": "degraded",
      "database": "disconnected",
      "llm_configured": true,
      "supabase": "connected"
    }
    ```

---

### 2. Chat Turn
- **Path**: `POST /chat`
- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "user_id": "student_alice",
    "session_id": "sess_20261015_01",
    "message": "Give me one more example of that.",
    "history": [
      {
        "role": "user",
        "text": "Can you explain how recursion works?"
      },
      {
        "role": "assistant",
        "text": "Recursion is when a function calls itself with a termination condition (base case)."
      }
    ]
  }
  ```
  - `user_id`: string matching `^[a-z0-9_-]{3,40}$`
  - `session_id`: string matching `^[a-z0-9_-]{3,64}$`
  - `message`: string (1 - 4000 characters)
  - `history` *(optional)*: array of recent turns from CURRENT chat (max 6 items, oldest first)
    - `role`: enum (`"user"` | `"assistant"`)
    - `text`: string (1 - 30,000 characters; frontend truncates prior turns to $\le 4000$ characters with `" [...]"`)
    - Total history text capped at 60,000 characters. Extra fields strictly rejected (`extra="forbid"`, returns 422).
    - Excludes the new message, `[System Message]` error replies, and `Stopped` notes.
    - Used strictly for resolving in-session references; memory extraction runs solely on `message`. Never persisted to new tables.

- **Response (200 OK)**:
  ```json
  {
    "reply": "Recursion can feel daunting at first! Since you understand functions, think of recursion as a function calling itself with a base condition...",
    "saved_memories": [
      {
        "id": "mem_rec_001",
        "kind": "STRUGGLES_WITH",
        "value": "recursion",
        "status": "active",
        "origin": "user_stated",
        "source_text": "I find recursion really tricky",
        "session_id": "sess_20261015_01",
        "created_at": "2026-10-15T10:00:00Z",
        "action": "created"
      }
    ],
    "retrieved_memories": [
      {
        "id": "mem_rec_001",
        "kind": "STRUGGLES_WITH",
        "value": "recursion",
        "status": "active",
        "origin": "user_stated",
        "source_text": "I find recursion really tricky",
        "session_id": "sess_20261015_01",
        "created_at": "2026-10-15T10:00:00Z"
      }
    ],
    "evidence_paths": [
      {
        "steps": [
          {
            "from": "student_alice",
            "relation": "HAS_MEMORY",
            "to": "recursion",
            "origin": "You said"
          },
          {
            "from": "recursion",
            "relation": "REQUIRES",
            "to": "functions",
            "origin": "Curated"
          }
        ]
      }
    ],
    "warnings": [],
    "explanation": "Retrieved 1 active memory matching concept 'recursion', traversing prerequisite prerequisite 'functions'."
  }
  ```

---

### 3. List User Memories
- **Path**: `GET /memories?user_id=student_alice`
- **Query Parameters**:
  - `user_id`: string (required)
- **Response (200 OK)**:
  ```json
  {
    "memories": [
      {
        "id": "mem_rec_001",
        "kind": "STRUGGLES_WITH",
        "value": "recursion",
        "status": "active",
        "origin": "user_stated",
        "source_text": "I find recursion really tricky",
        "session_id": "sess_20261015_01",
        "created_at": "2026-10-15T10:00:00Z"
      }
    ]
  }
  ```

---

### 4. List User Sessions
- **Path**: `GET /sessions?user_id=student_alice`
- **Query Parameters**:
  - `user_id`: string matching `^[a-z0-9_-]{3,40}$`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "sess_20261015_01",
      "title": "I find recursion really tricky",
      "updated_at": "2026-10-15T10:05:00Z",
      "created_at": "2026-10-15T10:00:00Z"
    }
  ]
  ```

---

### 5. Get Session Detail (Messages & Turns)
- **Path**: `GET /sessions/{session_id}?user_id=student_alice`
- **Path Parameters**:
  - `session_id`: string matching `^[a-z0-9_-]{3,64}$`
- **Query Parameters**:
  - `user_id`: string matching `^[a-z0-9_-]{3,40}$`
- **Response (200 OK)**:
  ```json
  {
    "id": "sess_20261015_01",
    "title": "I find recursion really tricky",
    "user_id": "student_alice",
    "created_at": "2026-10-15T10:00:00Z",
    "updated_at": "2026-10-15T10:05:00Z",
    "messages": [
      {
        "id": "msg_01",
        "session_id": "sess_20261015_01",
        "user_id": "student_alice",
        "role": "user",
        "text": "I find recursion really tricky",
        "turn": null,
        "created_at": "2026-10-15T10:00:00Z"
      },
      {
        "id": "msg_02",
        "session_id": "sess_20261015_01",
        "user_id": "student_alice",
        "role": "assistant",
        "text": "Recursion can feel daunting at first...",
        "turn": {
          "saved_memories": [],
          "retrieved_memories": [],
          "evidence_paths": [],
          "warnings": [],
          "explanation": "..."
        },
        "created_at": "2026-10-15T10:00:05Z"
      }
    ]
  }
  ```
- **Error (404 Not Found)**:
  Returned if the session does not exist or does not belong to the requesting `user_id`.

---

### 6. Rename Session
- **Path**: `PATCH /sessions/{session_id}`
- **Path Parameters**:
  - `session_id`: string matching `^[a-z0-9_-]{3,64}$`
- **Request Body**:
  ```json
  {
    "user_id": "student_alice",
    "title": "Mastering Recursion Fundamentals"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "id": "sess_20261015_01",
    "title": "Mastering Recursion Fundamentals",
    "updated_at": "2026-10-15T10:10:00Z",
    "created_at": "2026-10-15T10:00:00Z"
  }
  ```
- **Error (404 Not Found)**: Returned if the session does not exist or does not belong to `user_id`.

---

### 7. Delete Session
- **Path**: `DELETE /sessions/{session_id}?user_id=student_alice`
- **Path Parameters**:
  - `session_id`: string matching `^[a-z0-9_-]{3,64}$`
- **Query Parameters**:
  - `user_id`: string matching `^[a-z0-9_-]{3,40}$`
- **Response (200 OK)**:
  ```json
  {
    "status": "deleted",
    "id": "sess_20261015_01"
  }
  ```
- **Error (404 Not Found)**: Returned if the session does not exist or does not belong to `user_id`.

---

## CORS Allowed Methods
Allowed origins: explicit list matching `CORS_ORIGINS` (default: `http://localhost:5173,http://127.0.0.1:5173`).
Allowed methods (explicit, no wildcards): `["GET", "POST", "PATCH", "DELETE", "OPTIONS"]`.

---

## Error Handling Standard

- Standard non-2xx responses return:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid user_id format. Must match ^[a-z0-9_-]{3,40}$."
    }
  }
  ```
- **Partial Failure Rule**: If memories were saved to FalkorDB successfully, but downstream LLM answer generation failed, the server responds with **HTTP 200** containing the saved memories, an apology fallback reply, and a warning item `{ stage: "llm", message: "..." }`.
- **History Resiliency Rule**: If Supabase history persistence fails, `/chat` still returns normally with **HTTP 200** and appends a warning item `{ stage: "history", message: "..." }`.
