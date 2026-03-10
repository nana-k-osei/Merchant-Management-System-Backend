-- Maintain updated_at automatically on update.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operators_updated_at ON operators;
CREATE TRIGGER operators_updated_at
BEFORE UPDATE ON operators
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchants_updated_at ON merchants;
CREATE TRIGGER merchants_updated_at
BEFORE UPDATE ON merchants
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS webhook_subscriptions_updated_at ON webhook_subscriptions;
CREATE TRIGGER webhook_subscriptions_updated_at
BEFORE UPDATE ON webhook_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

