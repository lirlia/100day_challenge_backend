package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log"
)

// --- HTTP Handling (Port 80) / Also used for HTTPS after handshake ---

// parseHTTPRequest parses a simple HTTP/1.x request.
// ... (parseHTTPRequest function remains the same) ...

// handleHTTPData handles received HTTP data for a connection.
// ... (handleHTTPData function remains the same, but ensure it doesn't reference HTTP2State) ...

// buildHttpResponse constructs a basic HTTP response.
// ... (buildHttpResponse function remains the same) ...

// --- HTTP/2 Constants ---

const (
	// HTTP/2 Client Connection Preface
	ClientPreface  = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
	FrameHeaderLen = 9
)

// Frame Types
const (
	FrameTypeData         uint8 = 0x0
	FrameTypeHeaders      uint8 = 0x1
	FrameTypePriority     uint8 = 0x2
	FrameTypeRstStream    uint8 = 0x3
	FrameTypeSettings     uint8 = 0x4
	FrameTypePushPromise  uint8 = 0x5
	FrameTypePing         uint8 = 0x6
	FrameTypeGoAway       uint8 = 0x7
	FrameTypeWindowUpdate uint8 = 0x8
	FrameTypeContinuation uint8 = 0x9
)

// Frame Flags
const (
	FlagEndStream  uint8 = 0x1
	FlagEndHeaders uint8 = 0x4
	FlagPadded     uint8 = 0x8
	FlagPriority   uint8 = 0x20
	FlagAck        uint8 = 0x1 // Used by Settings and Ping
)

// --- HTTP2State definitions moved to tcp.go ---

// handleHTTP2Data processes decrypted Application Data as HTTP/2 frames.
func handleHTTP2Data(conn *TCPConnection, payload []byte) {
	connKey := conn.ConnectionKey()
	conn.Mutex.Lock()
	// Initialize buffer on first use
	if conn.HTTP2ReceiveBuffer == nil {
		conn.HTTP2ReceiveBuffer = new(bytes.Buffer)
		log.Printf("[HTTP/2 - %s] Initialized HTTP/2 Receive Buffer.", connKey)
	}
	// Append new payload
	n, err := conn.HTTP2ReceiveBuffer.Write(payload)
	if err != nil || n != len(payload) {
		log.Printf("[HTTP/2 Error - %s] Failed to write payload to H2 buffer: wrote %d, err %v", connKey, n, err)
		conn.Mutex.Unlock()
		// TODO: Consider GOAWAY or RST_STREAM
		return
	}
	currentH2State := conn.H2State
	h2BufferLen := conn.HTTP2ReceiveBuffer.Len()
	conn.Mutex.Unlock()

	if isDebug {
		log.Printf("[HTTP/2 Debug - %s] Appended %d bytes to H2 buffer. State: %v, Buffer len: %d", connKey, len(payload), currentH2State, h2BufferLen)
	}

	// 1. Check for Client Preface if in H2StateExpectPreface
	if currentH2State == H2StateExpectPreface {
		if h2BufferLen >= len(ClientPreface) {
			conn.Mutex.Lock() // Lock for reading and modifying buffer/state
			prefaceBytes := make([]byte, len(ClientPreface))
			_, err := conn.HTTP2ReceiveBuffer.Read(prefaceBytes) // Consume preface
			if err != nil {
				log.Printf("[HTTP/2 Error - %s] Failed to read preface from buffer: %v", connKey, err)
				conn.Mutex.Unlock()
				// TODO: GOAWAY
				return
			}
			conn.Mutex.Unlock() // Unlock after buffer read

			if string(prefaceBytes) == ClientPreface {
				log.Printf("[HTTP/2 Info - %s] Client Preface received and validated.", connKey)

				// Send Server SETTINGS frame (empty)
				err = sendHTTP2Frame(conn, FrameTypeSettings, 0, 0, nil)
				if err != nil {
					log.Printf("[HTTP/2 Error - %s] Failed to send initial server SETTINGS frame: %v", connKey, err)
					// TODO: Close connection? GOAWAY?
					return
				}
				log.Printf("[HTTP/2 Info - %s] Initial empty server SETTINGS frame sent.", connKey)

				// Transition state
				conn.Mutex.Lock()
				conn.H2State = H2StateExpectSettings
				log.Printf("[HTTP/2 Info - %s] State transition: %v -> %v", connKey, H2StateExpectPreface, conn.H2State)
				currentH2State = conn.H2State // Update local state variable
				conn.Mutex.Unlock()

				// Continue processing remaining buffer data immediately
				// Fallthrough to frame processing loop below

			} else {
				log.Printf("[HTTP/2 Error - %s] Invalid Client Preface received: %x", connKey, prefaceBytes)
				// TODO: Send GOAWAY(protocol_error) and close connection
				return
			}
		} else {
			if isDebug {
				log.Printf("[HTTP/2 Debug - %s] Waiting for more data for Client Preface (need %d, have %d).", connKey, len(ClientPreface), h2BufferLen)
			}
			return // Not enough data yet
		}
	}

	// 2. Process HTTP/2 Frames
	conn.Mutex.Lock() // Lock for reading buffer/state
	initialBufferLen := conn.HTTP2ReceiveBuffer.Len()
	if isDebug && initialBufferLen > 0 {
		log.Printf("[HTTP/2 Debug - %s] Entering frame processing loop. State: %v, Buffer len: %d", connKey, conn.H2State, initialBufferLen)
	}
	// Keep processing as long as there's enough data for a frame header
	for conn.HTTP2ReceiveBuffer.Len() >= FrameHeaderLen {
		currentBufferLen := conn.HTTP2ReceiveBuffer.Len() // For logging inside loop
		if isDebug {
			log.Printf("[HTTP/2 Debug - %s] Frame loop iteration. Buffer len: %d", connKey, currentBufferLen)
		}

		// Peek at header to get length
		headerBytes := conn.HTTP2ReceiveBuffer.Bytes()[:FrameHeaderLen]
		payloadLen := uint32(headerBytes[0])<<16 | uint32(headerBytes[1])<<8 | uint32(headerBytes[2])
		frameType := headerBytes[3]
		flags := headerBytes[4]
		// Stream ID (ignore reserved bit)
		streamID := binary.BigEndian.Uint32(headerBytes[5:9]) & 0x7FFFFFFF

		if isDebug {
			log.Printf("[HTTP/2 Debug - %s] Peeked frame header: Len=%d, Type=%d, Flags=0x%x, StreamID=%d", connKey, payloadLen, frameType, flags, streamID)
		}

		fullFrameLength := FrameHeaderLen + int(payloadLen)
		if currentBufferLen < fullFrameLength {
			if isDebug {
				log.Printf("[HTTP/2 Debug - %s] Incomplete frame. Need %d bytes, have %d. Waiting.", connKey, fullFrameLength, currentBufferLen)
			}
			break // Need more data for this frame
		}

		// Consume the full frame (header + payload)
		frameBytes := make([]byte, fullFrameLength)
		nRead, err := conn.HTTP2ReceiveBuffer.Read(frameBytes)
		if err != nil || nRead != fullFrameLength {
			log.Printf("[HTTP/2 Error - %s] Error consuming frame from buffer: read %d, err %v. Expected %d", connKey, nRead, err, fullFrameLength)
			conn.HTTP2ReceiveBuffer.Reset() // Clear potentially corrupted buffer
			// TODO: GOAWAY?
			break // Stop processing
		}
		framePayload := frameBytes[FrameHeaderLen:]
		if isDebug {
			log.Printf("[HTTP/2 Debug - %s] Consumed frame. Type: %d, Payload len: %d. Remaining buffer: %d", connKey, frameType, len(framePayload), conn.HTTP2ReceiveBuffer.Len())
		}

		// --- Process the frame based on type and state ---
		switch frameType {
		case FrameTypeSettings:
			log.Printf("[HTTP/2 Info - %s] Received SETTINGS frame (Flags: 0x%x, StreamID: %d, PayloadLen: %d)", connKey, flags, streamID, payloadLen)
			// Basic validation
			if streamID != 0 {
				log.Printf("[HTTP/2 Error - %s] Received SETTINGS frame with non-zero StreamID (%d).", connKey, streamID)
				// TODO: Send GOAWAY(protocol_error)
				break
			}
			if flags&FlagAck != 0 { // This is an ACK for our SETTINGS
				if payloadLen != 0 {
					log.Printf("[HTTP/2 Error - %s] Received SETTINGS ACK with non-empty payload (%d bytes).", connKey, payloadLen)
					// TODO: Send GOAWAY(frame_size_error)
					break
				}
				log.Printf("[HTTP/2 Info - %s] Received SETTINGS ACK.", connKey)
				// No state change needed for ACK in this simple impl.
			} else { // This is the client's initial SETTINGS frame
				// TODO: Parse settings if needed in the future
				log.Printf("[HTTP/2 Info - %s] Received client's initial SETTINGS frame. Sending ACK.", connKey)
				// Release lock before potentially blocking send operation
				conn.Mutex.Unlock()

				// Send SETTINGS ACK
				err = sendHTTP2Frame(conn, FrameTypeSettings, FlagAck, 0, nil) // ACK has FlagAck set, empty payload

				// Re-acquire lock after send operation
				conn.Mutex.Lock()

				if err != nil {
					log.Printf("[HTTP/2 Error - %s] Failed to send SETTINGS ACK: %v", connKey, err)
					// TODO: GOAWAY?
					break
				}
				log.Printf("[HTTP/2 Info - %s] SETTINGS ACK sent successfully.", connKey)
				// If we were expecting settings, transition to ready
				if conn.H2State == H2StateExpectSettings {
					conn.H2State = H2StateReady
					log.Printf("[HTTP/2 Info - %s] State transition: %v -> %v", connKey, H2StateExpectSettings, conn.H2State)
				}
			}

		case FrameTypeHeaders:
			log.Printf("[HTTP/2 Info - %s] Received HEADERS frame (StreamID: %d, Flags: 0x%x, PayloadLen: %d)", connKey, streamID, flags, payloadLen)
			log.Printf("[HTTP/2 Debug - %s] HEADERS payload (raw): %x", connKey, framePayload)
			// TODO: Implement basic header decoding (HPACK is complex, skip for now)
			// For a simple GET, this would contain method, path, scheme, authority

			// --- Simple Hardcoded Response ---
			// Simulate processing the request and sending a response on the same stream
			if streamID != 0 { // Ignore HEADERS on stream 0
				log.Printf("[HTTP/2 Debug - %s] Processing HEADERS for Stream %d.", connKey, streamID)
				log.Printf("[HTTP/2 Info - %s] Sending hardcoded response for Stream %d", connKey, streamID)

				// 1. Send HEADERS frame (response status 200 OK)
				// Manually construct a minimal HEADERS block (pseudo-headers first)
				// This is NOT HPACK compliant, just raw bytes for demonstration
				var pseudoHeaders bytes.Buffer
				// :status: 200 (Index 8) - 0x88
				pseudoHeaders.WriteByte(0x88)

				var responseHeaders bytes.Buffer
				// content-type: text/plain (Index 32 + Literal Value) - Needs proper HPACK
				// Simplification: Sending raw bytes, NOT valid HPACK
				contentTypeHeader := "content-type"
				contentTypeValue := "text/plain"
				// Example: Literal Header Field without Indexing – New Name
				responseHeaders.WriteByte(0x00) // Indicate literal name/value
				responseHeaders.WriteByte(byte(len(contentTypeHeader)))
				responseHeaders.Write([]byte(contentTypeHeader))
				responseHeaders.WriteByte(byte(len(contentTypeValue)))
				responseHeaders.Write([]byte(contentTypeValue))

				headersPayload := append(pseudoHeaders.Bytes(), responseHeaders.Bytes()...)

				// Release lock before sending HEADERS
				conn.Mutex.Unlock()
				err = sendHTTP2Frame(conn, FrameTypeHeaders, FlagEndHeaders, streamID, headersPayload)
				// Re-acquire lock after sending HEADERS
				conn.Mutex.Lock()

				if err != nil {
					log.Printf("[HTTP/2 Error - %s] Failed to send HEADERS response frame: %v", connKey, err)
					break
				}
				log.Printf("[HTTP/2 Info - %s] Sent HEADERS response frame for Stream %d.", connKey, streamID)

				// 2. Send DATA frame (response body) with END_STREAM
				responseBody := []byte("Hello from User-Space HTTP/2!")
				// Release lock before sending DATA
				conn.Mutex.Unlock()
				err = sendHTTP2Frame(conn, FrameTypeData, FlagEndStream, streamID, responseBody)
				// Re-acquire lock after sending DATA
				conn.Mutex.Lock()

				if err != nil {
					log.Printf("[HTTP/2 Error - %s] Failed to send DATA response frame: %v", connKey, err)
					break
				}
				log.Printf("[HTTP/2 Info - %s] Sent DATA response frame with END_STREAM for Stream %d.", connKey, streamID)
			}

		case FrameTypeWindowUpdate:
			log.Printf("[HTTP/2 Info - %s] Received WINDOW_UPDATE frame (StreamID: %d, PayloadLen: %d)", connKey, streamID, payloadLen)
			// Required for flow control, but ignore payload for now
			if payloadLen != 4 {
				log.Printf("[HTTP/2 Error - %s] Received WINDOW_UPDATE with invalid length %d.", connKey, payloadLen)
				// TODO: Send GOAWAY(frame_size_error)
				break
			}
			// increment := binary.BigEndian.Uint32(framePayload) & 0x7FFFFFFF // Ignore reserved bit
			// log.Printf("[HTTP/2 Info - %s]   Window Increment: %d", connKey, increment)
			// TODO: Actually handle window updates if sending large data

		case FrameTypePing:
			log.Printf("[HTTP/2 Info - %s] Received PING frame (Flags: 0x%x, PayloadLen: %d)", connKey, flags, payloadLen)
			if streamID != 0 {
				log.Printf("[HTTP/2 Error - %s] Received PING frame with non-zero StreamID (%d).", connKey, streamID)
				// TODO: Send GOAWAY(protocol_error)
				break
			}
			if payloadLen != 8 {
				log.Printf("[HTTP/2 Error - %s] Received PING frame with invalid payload length %d.", connKey, payloadLen)
				// TODO: Send GOAWAY(frame_size_error)
				break
			}
			if flags&FlagAck == 0 { // If it's not an ACK, respond with ACK
				log.Printf("[HTTP/2 Info - %s] Received PING, sending PONG (ACK).", connKey)
				pingPayload := framePayload // Capture payload before unlock
				// Release lock before sending PING ACK
				conn.Mutex.Unlock()
				err = sendHTTP2Frame(conn, FrameTypePing, FlagAck, 0, pingPayload) // Echo payload back
				// Re-acquire lock after sending PING ACK
				conn.Mutex.Lock()
				if err != nil {
					log.Printf("[HTTP/2 Error - %s] Failed to send PING ACK: %v", connKey, err)
				}
			} else {
				log.Printf("[HTTP/2 Info - %s] Received PING ACK (PONG).", connKey)
			}

		default:
			log.Printf("[HTTP/2 Warn - %s] Received unhandled frame type %d (Flags: 0x%x, StreamID: %d, PayloadLen: %d)", connKey, frameType, flags, streamID, payloadLen)
		}
	} // end for loop processing frames

	finalBufferLen := conn.HTTP2ReceiveBuffer.Len()
	conn.Mutex.Unlock() // Unlock after processing loop

	if isDebug && initialBufferLen > 0 {
		log.Printf("[HTTP/2 Debug - %s] Exiting frame processing loop. Final buffer len: %d", connKey, finalBufferLen)
	}
}

// buildHTTP2Frame constructs a raw HTTP/2 frame byte slice.
func buildHTTP2Frame(frameType uint8, flags uint8, streamID uint32, payload []byte) ([]byte, error) {
	payloadLen := len(payload)
	if payloadLen > 1<<24-1 { // Max payload size 2^24 - 1
		return nil, fmt.Errorf("http2: frame payload too large (%d bytes)", payloadLen)
	}
	if streamID > 0x7FFFFFFF {
		return nil, fmt.Errorf("http2: stream ID too large (%d)", streamID)
	}

	frame := make([]byte, FrameHeaderLen+payloadLen)

	// Length (3 bytes)
	frame[0] = byte(payloadLen >> 16)
	frame[1] = byte(payloadLen >> 8)
	frame[2] = byte(payloadLen)
	// Type (1 byte)
	frame[3] = frameType
	// Flags (1 byte)
	frame[4] = flags
	// Stream Identifier (4 bytes, clear reserved bit)
	binary.BigEndian.PutUint32(frame[5:9], streamID&0x7FFFFFFF)

	// Payload
	copy(frame[FrameHeaderLen:], payload)

	return frame, nil
}

// readHTTP2Frame reads a single HTTP/2 frame from the buffer.
// It consumes the frame data from the buffer if a full frame is available.
// Returns the header, payload, type, flags, stream ID, and error.
func readHTTP2Frame(buffer *bytes.Buffer) (frameHeader []byte, payload []byte, frameType uint8, flags uint8, streamID uint32, err error) {
	if buffer.Len() < FrameHeaderLen {
		err = io.ErrShortBuffer // Not enough data for header
		return
	}

	headerBytes := buffer.Bytes()[:FrameHeaderLen] // Peek
	payloadLen := uint32(headerBytes[0])<<16 | uint32(headerBytes[1])<<8 | uint32(headerBytes[2])
	frameType = headerBytes[3]
	flags = headerBytes[4]
	streamID = binary.BigEndian.Uint32(headerBytes[5:9]) & 0x7FFFFFFF

	fullFrameLength := FrameHeaderLen + int(payloadLen)
	if buffer.Len() < fullFrameLength {
		err = io.ErrShortBuffer // Not enough data for full frame
		return
	}

	// Consume the full frame
	frameData := make([]byte, fullFrameLength)
	_, readErr := buffer.Read(frameData)
	if readErr != nil {
		err = fmt.Errorf("failed to read full frame from buffer: %w", readErr)
		return
	}

	frameHeader = frameData[:FrameHeaderLen]
	payload = frameData[FrameHeaderLen:]

	return // Success
}

// sendHTTP2Frame builds an HTTP/2 frame, wraps it in a TLS record, and sends it.
func sendHTTP2Frame(conn *TCPConnection, frameType uint8, flags uint8, streamID uint32, payload []byte) error {
	connKey := conn.ConnectionKey()
	// Add log before sending
	log.Printf("[HTTP/2 Send Debug - %s] Preparing to send H2 Frame. Type: %d, StreamID: %d, PayloadLen: %d", connKey, frameType, streamID, len(payload))

	// 1. Build the HTTP/2 frame
	h2Frame, err := buildHTTP2Frame(frameType, flags, streamID, payload)
	if err != nil {
		return fmt.Errorf("failed to build HTTP/2 frame (Type: %d) for %s: %w", frameType, connKey, err)
	}

	// 2. Build the TLS Application Data record containing the frame
	// We use 0x0303 for TLS 1.2 version number
	tlsRecord, err := buildTLSRecord(TLSRecordTypeApplicationData, 0x0303, h2Frame)
	if err != nil {
		return fmt.Errorf("failed to build TLS record for H2 frame (Type: %d) for %s: %w", frameType, connKey, err)
	}

	// 3. Send the TLS record
	// Note: sendRawTLSRecord handles encryption if enabled
	sentBytes, err := sendRawTLSRecord(conn.TunIFCE, conn, tlsRecord) // Pass TUN interface if needed
	if err != nil {
		// Add more detail to error log
		log.Printf("[HTTP/2 Send Error - %s] sendRawTLSRecord failed for H2 frame (Type: %d): %v", connKey, frameType, err)
		return fmt.Errorf("failed to send TLS record containing H2 frame (Type: %d) for %s: %w", frameType, connKey, err)
	}
	// Add log after successful sendRawTLSRecord
	log.Printf("[HTTP/2 Send Debug - %s] sendRawTLSRecord successful for H2 Frame. Type: %d, StreamID: %d, SentBytes (TLS): %d", connKey, frameType, streamID, sentBytes)

	// 4. Update sequence numbers (crucial for TUN mode)
	if conn.TunIFCE != nil {
		conn.Mutex.Lock()
		conn.ServerNextSeq += uint32(sentBytes) // Increment by TUN payload bytes sent
		if isDebug {
			log.Printf("[SeqNum Update - %s] After H2 Frame (Type %d): ServerNextSeq = %d (added %d)", connKey, frameType, conn.ServerNextSeq, sentBytes)
		}
		conn.Mutex.Unlock()
	}
	if isDebug {
		log.Printf("[HTTP/2 Send OK - %s] Sent H2 Frame. Type: %d, Flags: 0x%x, StreamID: %d, PayloadLen: %d, TLS Record Len: %d", connKey, frameType, flags, streamID, len(payload), len(tlsRecord))
	}

	return nil
}
