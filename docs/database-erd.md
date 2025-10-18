# Attendance App Database Schema

The diagram below captures the primary tables managed by Drizzle (PostgreSQL) along with their key attributes and relationships used across the attendance system.

```mermaid
---
title: Attendance App Database ERD
---
erDiagram
    USER {
        uuid id PK
        string name
        string email UK
        string username UK
        string role
        boolean emailVerified
        boolean banned
        datetime createdAt
        datetime updatedAt
    }

    SESSION {
        uuid id PK
        datetime expiresAt
        string token UK
        string userId FK
        string ipAddress
        string userAgent
        datetime createdAt
        datetime updatedAt
    }

    ACCOUNT {
        uuid id PK
        string accountId
        string providerId
        string userId FK
        string accessToken
        string refreshToken
        string idToken
        datetime accessTokenExpiresAt
        datetime refreshTokenExpiresAt
        string scope
        string password
        datetime createdAt
        datetime updatedAt
    }

    VERIFICATION {
        uuid id PK
        string identifier
        string value
        datetime expiresAt
        datetime createdAt
        datetime updatedAt
    }

    SHIFT {
        string code PK
        string label
        string start
        string end
        boolean active
        int sortOrder
        datetime createdAt
        datetime updatedAt
    }

    ATTENDANCE_DAY {
        string id PK
        string userId FK
        date date
        string selectedShiftCode
        string shiftType
        datetime createdAt
        datetime updatedAt
    }

    ATTENDANCE_LOG {
        string id PK
        string userId FK
        date date
        string type
        datetime timestamp
        double lat
        double lng
        double accuracy
        string shiftCode
        string shiftType
        string earlyReason
        datetime createdAt
        datetime updatedAt
    }

    USER ||--o{ SESSION : "maintains"
    USER ||--o{ ACCOUNT : "authorizes"
    USER ||--o{ ATTENDANCE_DAY : "owns"
    USER ||--o{ ATTENDANCE_LOG : "records"

    SHIFT }o..o{ ATTENDANCE_DAY : "selected by"
    SHIFT }o..o{ ATTENDANCE_LOG : "tagged on"
    ATTENDANCE_DAY ||..o{ ATTENDANCE_LOG : "aggregates"
```

**Notes**

- `ATTENDANCE_DAY` and `ATTENDANCE_LOG` reference shifts by code rather than a hard foreign key, so the relationships to `SHIFT` are depicted as optional (dashed).
- `ATTENDANCE_DAY` aggregates logs for the same user and date; although enforced via `(userId, date)` in application logic, this association is illustrated for clarity.
