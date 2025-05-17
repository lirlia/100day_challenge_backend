package store

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCommandEncodingDecoding(t *testing.T) {
	t.Run("CreateTableCommand", func(t *testing.T) {
		payload := CreateTableCommandPayload{
			TableName:        "test_table",
			PartitionKeyName: "pk",
			SortKeyName:      "sk",
		}
		cmdBytes, err := EncodeCommand(CreateTableCommandType, payload)
		require.NoError(t, err)

		var genericCmd Command
		err = json.Unmarshal(cmdBytes, &genericCmd)
		require.NoError(t, err)
		require.Equal(t, CreateTableCommandType, genericCmd.Type)

		decodedPayload, err := DecodeCreateTableCommand(genericCmd.Payload)
		require.NoError(t, err)
		require.Equal(t, payload, *decodedPayload)
	})

	t.Run("DeleteTableCommand", func(t *testing.T) {
		payload := DeleteTableCommandPayload{
			TableName: "test_table",
		}
		cmdBytes, err := EncodeCommand(DeleteTableCommandType, payload)
		require.NoError(t, err)

		var genericCmd Command
		err = json.Unmarshal(cmdBytes, &genericCmd)
		require.NoError(t, err)
		require.Equal(t, DeleteTableCommandType, genericCmd.Type)

		decodedPayload, err := DecodeDeleteTableCommand(genericCmd.Payload)
		require.NoError(t, err)
		require.Equal(t, payload, *decodedPayload)
	})

	t.Run("PutItemCommand", func(t *testing.T) {
		itemData := map[string]interface{}{"pk": "id1", "sk": "val1", "data": "hello"}
		payload, err := NewPutItemCommandPayload("test_table", itemData)
		require.NoError(t, err)

		// Freeze time for consistent timestamp testing if necessary, but here we mostly check structure
		// For this test, we'll re-decode and check essential fields, ignoring exact timestamp match for simplicity

		cmdBytes, err := EncodeCommand(PutItemCommandType, payload)
		require.NoError(t, err)

		var genericCmd Command
		err = json.Unmarshal(cmdBytes, &genericCmd)
		require.NoError(t, err)
		require.Equal(t, PutItemCommandType, genericCmd.Type)

		decodedPayload, err := DecodePutItemCommand(genericCmd.Payload)
		require.NoError(t, err)

		require.Equal(t, payload.TableName, decodedPayload.TableName)
		require.JSONEq(t, string(payload.Item), string(decodedPayload.Item))
		require.True(t, decodedPayload.Timestamp > 0) // Timestamp should be set
	})

	t.Run("DeleteItemCommand", func(t *testing.T) {
		payload := NewDeleteItemCommandPayload("test_table", "id1", "val1")

		cmdBytes, err := EncodeCommand(DeleteItemCommandType, payload)
		require.NoError(t, err)

		var genericCmd Command
		err = json.Unmarshal(cmdBytes, &genericCmd)
		require.NoError(t, err)
		require.Equal(t, DeleteItemCommandType, genericCmd.Type)

		decodedPayload, err := DecodeDeleteItemCommand(genericCmd.Payload)
		require.NoError(t, err)

		require.Equal(t, payload.TableName, decodedPayload.TableName)
		require.Equal(t, payload.PartitionKey, decodedPayload.PartitionKey)
		require.Equal(t, payload.SortKey, decodedPayload.SortKey)
		require.True(t, decodedPayload.Timestamp > 0)
	})

	t.Run("EncodeCommand error on bad payload", func(t *testing.T) {
		// Use a channel, which cannot be marshaled to JSON
		badPayload := make(chan int)
		_, err := EncodeCommand(CreateTableCommandType, badPayload)
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed to marshal command payload")
	})

	t.Run("Decode error on malformed payload", func(t *testing.T) {
		malformedPayload := json.RawMessage("{\"table_name\": \"test\", \"partition_key_name\": 123}") // partition_key_name should be string
		_, err := DecodeCreateTableCommand(malformedPayload)
		require.Error(t, err)
		require.Contains(t, err.Error(), "failed to unmarshal CreateTableCommandPayload")
	})
}

func TestNewPutItemCommandPayload(t *testing.T) {
	item := map[string]interface{}{"id": "item1", "value": "data"}
	payload, err := NewPutItemCommandPayload("myTable", item)
	require.NoError(t, err)
	require.Equal(t, "myTable", payload.TableName)
	require.NotZero(t, payload.Timestamp)

	var decodedItem map[string]interface{}
	err = json.Unmarshal(payload.Item, &decodedItem)
	require.NoError(t, err)
	require.Equal(t, item, decodedItem)
}

func TestNewDeleteItemCommandPayload(t *testing.T) {
	payload := NewDeleteItemCommandPayload("myTable", "pkVal", "skVal")
	require.Equal(t, "myTable", payload.TableName)
	require.Equal(t, "pkVal", payload.PartitionKey)
	require.Equal(t, "skVal", payload.SortKey)
	require.NotZero(t, payload.Timestamp)
}
