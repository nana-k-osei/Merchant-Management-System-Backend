-- Create indexes for common queries.

CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_country ON merchants(country);
CREATE INDEX IF NOT EXISTS idx_merchants_assigned_reviewer ON merchants(assigned_reviewer);

CREATE INDEX IF NOT EXISTS idx_documents_merchant ON kyb_documents(merchant_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON kyb_documents(status);

CREATE INDEX IF NOT EXISTS idx_status_history_merchant ON merchant_status_history(merchant_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON merchant_status_history(changed_at);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_type ON webhook_subscriptions(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_is_active ON webhook_subscriptions(is_active);

