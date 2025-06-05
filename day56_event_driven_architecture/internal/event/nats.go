package event

import (
	"encoding/json"
	"log"
	"time"

	"github.com/nats-io/nats.go"
)

var nc *nats.Conn // NATS connection

// ConnectNATS establishes a connection to the NATS server.
// It retries a few times if the connection fails.
func ConnectNATS(url string) error {
	var err error
	// Retry connecting a few times as NATS server might be starting up
	for i := 0; i < 5; i++ {
		nc, err = nats.Connect(url)
		if err == nil {
			log.Println("Successfully connected to NATS at", url)
			return nil
		}
		log.Printf("Failed to connect to NATS (attempt %d/5): %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	return err
}

// PublishEvent serializes the data to JSON and publishes it to the given subject.
func PublishEvent(subject string, data interface{}) error {
	if nc == nil {
		log.Fatalln("NATS connection is not established. Cannot publish event.")
	}
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return nc.Publish(subject, jsonData)
}

// SubscribeToEvent subscribes to the given subject and executes the handler function for each message.
// The handler should be a function that takes *nats.Msg as an argument.
func SubscribeToEvent(subject string, handler nats.MsgHandler) (*nats.Subscription, error) {
	if nc == nil {
		log.Fatalln("NATS connection is not established. Cannot subscribe to event.")
	}
	sub, err := nc.Subscribe(subject, handler)
	if err != nil {
		return nil, err
	}
	log.Printf("Successfully subscribed to subject: %s", subject)
	return sub, nil
}

// CloseNATS closes the NATS connection if it's open.
func CloseNATS() {
	if nc != nil && !nc.IsClosed() {
		nc.Drain() // Drain will wait for all pending messages to be processed
		nc.Close()
		log.Println("NATS connection closed.")
	}
}
