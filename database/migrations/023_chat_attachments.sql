CREATE TABLE chat_message_attachments (
 message_id UUID PRIMARY KEY REFERENCES chat_messages(id),
 asset_id UUID NOT NULL UNIQUE REFERENCES media_assets(id)
);
