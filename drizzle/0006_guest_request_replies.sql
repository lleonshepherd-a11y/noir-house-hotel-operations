ALTER TABLE guest_requests ADD COLUMN access_token TEXT;
ALTER TABLE guest_requests ADD COLUMN reply_body TEXT;
ALTER TABLE guest_requests ADD COLUMN replied_at TEXT;
ALTER TABLE guest_requests ADD COLUMN replied_by_staff_id TEXT REFERENCES staff(id);

CREATE UNIQUE INDEX idx_guest_requests_access_token
ON guest_requests(access_token)
WHERE access_token IS NOT NULL;
