package main

import (
	"bufio"
	"bytes"
	"fmt"
	"log"
	"strings"

	"github.com/songgao/water"
)

// --- HTTP Handling (Port 80) / Also used for HTTPS after handshake ---

// parseHTTPRequest parses a simple HTTP/1.x request.
func parseHTTPRequest(payload []byte) (method, uri, version string, headers map[string]string, err error) {
	headers = make(map[string]string)
	reader := bufio.NewReader(bytes.NewReader(payload))
	reqLine, err := reader.ReadString('\n')
	if err != nil {
		err = fmt.Errorf("failed to read request line: %w", err)
		return
	}
	reqLine = strings.TrimSpace(reqLine)
	parts := strings.Fields(reqLine)
	if len(parts) != 3 {
		err = fmt.Errorf("invalid request line format: %q", reqLine)
		return
	}
	method, uri, version = parts[0], parts[1], parts[2]
	if !strings.HasPrefix(version, "HTTP/1.") {
		err = fmt.Errorf("unsupported HTTP version: %s", version)
		return
	}
	for {
		line, errRead := reader.ReadString('\n')
		if errRead != nil {
			if errRead.Error() == "EOF" || line == "\r\n" || line == "\n" {
				err = nil
				break
			}
			err = fmt.Errorf("failed to read header line: %w", errRead)
			return
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		headerParts := strings.SplitN(line, ":", 2)
		if len(headerParts) != 2 {
			log.Printf("Skipping malformed header line: %q", line)
			continue
		}
		headerName := strings.TrimSpace(headerParts[0])
		headerValue := strings.TrimSpace(headerParts[1])
		headers[headerName] = headerValue
	}
	return
}

// handleHTTPData handles received HTTP data for a connection.
func handleHTTPData(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	log.Printf("Handling HTTP data (%d bytes) for %s (Port: %d)", len(payload), conn.ConnectionKey(), conn.ServerPort)

	// Parse the HTTP request from the payload.
	method, uri, _, headers, err := parseHTTPRequest(payload)
	if err != nil {
		log.Printf("Failed to parse HTTP request for %s: %v", conn.ConnectionKey(), err)
		// TODO: Send HTTP 400 Bad Request response.
		//       For port 443, this needs to be wrapped in a TLS record.
		//       Consider closing the connection after sending the error.
		return
	}

	log.Printf("HTTP Request Parsed: [%s %s ...] from %s:%d", method, uri, conn.ClientIP, conn.ClientPort)
	for k, v := range headers {
		log.Printf("  HTTP Header: %s: %s", k, v)
	}

	// --- Construct the HTTP 200 OK response ---
	var responseText string
	if conn.ServerPort == 443 {
		responseText = "<html><body><h1>Hello from userspace HTTPS/1.1! (Port 443)</h1></body></html>"
	} else {
		responseText = "<html><body><h1>Hello from userspace HTTP/1.1! (Port 80)</h1></body></html>"
	}

	body := []byte(responseText)
	responseHeaders := map[string]string{
		"Content-Type":   "text/html; charset=utf-8",
		"Content-Length": fmt.Sprintf("%d", len(body)),
		// "Connection":     "close", // Let the client decide or rely on TLS close_notify
	}
	statusLine := "HTTP/1.1 200 OK"

	var respBuilder strings.Builder
	respBuilder.WriteString(statusLine + "\r\n")
	for k, v := range responseHeaders {
		respBuilder.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	respBuilder.WriteString("\r\n")
	respBuilder.Write(body) // Write body bytes directly
	httpRespBytes := []byte(respBuilder.String())

	// --- Send the response based on the connection type/port and TLS state ---
	conn.Mutex.Lock() // Lock to check mode and TLS state safely
	isTCPMode := conn.TCPConn != nil
	isTunMode := conn.TunIFCE != nil
	isTLSEnabled := conn.EncryptionEnabled // Check if handshake is complete and encryption is on
	serverPort := conn.ServerPort          // Get port for logging/context
	serverIP := conn.ServerIP
	clientIP := conn.ClientIP
	clientPort := conn.ClientPort
	// currentTCPState := conn.State // Get current state before potential change // Removed as state change logic is moved inside TUN block
	conn.Mutex.Unlock() // Unlock before potentially blocking send operations

	connKey := fmt.Sprintf("%s:%d-%s:%d", clientIP, clientPort, serverIP, serverPort) // Reconstruct key outside lock

	if isTCPMode {
		if isTLSEnabled { // Send via TLS if enabled
			// TCP Mode with TLS: Send response via TLS Application Data record
			log.Printf("[TLS AppData Send - %s - TCP Mode] Sending HTTP response (%d bytes) as Application Data.", connKey, len(httpRespBytes))
			appDataRecord, err := buildTLSRecord(TLSRecordTypeApplicationData, 0x0303, httpRespBytes)
			if err != nil {
				log.Printf("[TLS Error - %s - TCP Mode] Failed to build Application Data record: %v", connKey, err)
				return
			}
			// Pass nil for ifce in TCP mode. sendRawTLSRecord handles the mode check.
			_, err = sendRawTLSRecord(nil, conn, appDataRecord)
			if err != nil {
				log.Printf("[TLS Error - %s - TCP Mode] Failed to send Application Data record: %v", connKey, err)
			}
		} else {
			// TCP Mode without TLS: Send raw via net.Conn
			log.Printf("[HTTP Info - %s - TCP Mode] Sending HTTP response (%d bytes) via raw net.Conn.", connKey, len(httpRespBytes))
			// Re-lock to access conn.TCPConn safely
			conn.Mutex.Lock()
			tcpConn := conn.TCPConn
			conn.Mutex.Unlock()
			if tcpConn != nil {
				_, err := tcpConn.Write(httpRespBytes) // Write directly
				if err != nil {
					log.Printf("[HTTP Error - %s - TCP Mode] Error writing raw HTTP response: %v", connKey, err)
				}
				// Optionally close connection here or rely on client closing for HTTP/1.1
			} else {
				log.Printf("[HTTP Error - %s - TCP Mode] TCPConn is nil when trying to write raw response.", connKey)
			}
		}
	} else if isTunMode {
		// TUN Mode logic needs similar check for isTLSEnabled
		tunIFCE := ifce // Get ifce from argument
		if isTLSEnabled {
			// TUN Mode with TLS: Send response via TLS Application Data record
			log.Printf("[TLS AppData Send - %s - TUN Mode] Sending HTTP response (%d bytes) as Application Data.", connKey, len(httpRespBytes))
			appDataRecord, err := buildTLSRecord(TLSRecordTypeApplicationData, 0x0303, httpRespBytes)
			if err != nil {
				log.Printf("[TLS Error - %s - TUN Mode] Failed to build Application Data record: %v", connKey, err)
				return
			}
			// Pass non-nil ifce. sendRawTLSRecord handles the mode check.
			sentBytes, err := sendRawTLSRecord(tunIFCE, conn, appDataRecord)
			if err != nil {
				log.Printf("[TLS Error - %s - TUN Mode] Failed to send Application Data record: %v", connKey, err)
			} else {
				// Update sequence number after successful send in TUN mode
				conn.Mutex.Lock()
				conn.ServerNextSeq += uint32(sentBytes)
				log.Printf("[SeqNum Update - %s] After HTTP AppData: ServerNextSeq = %d (added %d)", connKey, conn.ServerNextSeq, sentBytes)
				conn.Mutex.Unlock()
			}
		} else {
			// TUN Mode without TLS (e.g., Port 80): Send raw TCP packets
			log.Printf("TUN Mode: Sending raw HTTP response (%d bytes) directly via TCP packet.", len(httpRespBytes))
			// Send raw HTTP response without TLS
			flags := uint8(TCPFlagPSH | TCPFlagACK)
			// MODIFIED: Assign sentBytes to _ and update sequence number
			sentBytes, err := sendTCPPacket(tunIFCE, conn.ServerIP, conn.ClientIP, uint16(conn.ServerPort), uint16(conn.ClientPort),
				conn.ServerNextSeq, conn.ClientNextSeq, flags, httpRespBytes)
			if err != nil {
				log.Printf("[HTTP Error - %s - TUN Mode, No TLS] Failed to send raw HTTP response packet: %v", connKey, err)
			} else {
				// Update sequence number after successful send
				conn.Mutex.Lock()
				conn.ServerNextSeq += uint32(sentBytes)
				log.Printf("[SeqNum Update - %s] After Raw HTTP: ServerNextSeq = %d (added %d)", connKey, conn.ServerNextSeq, sentBytes)
				conn.Mutex.Unlock()
			}
		}
	} else {
		log.Printf("[Error - %s] handleHTTPData called with connection in invalid state (no TCPConn or TunIFCE)", connKey)
	}

	// Potentially Close Connection (e.g., HTTP/1.0 or Connection: close header)
	// Simple logic: Assume close after sending response for non-TLS HTTP for now.
	if !isTLSEnabled {
		log.Printf("Closing connection %s after non-TLS HTTP response.", connKey)
		// TODO: Implement proper FIN sequence for TUN mode
		// For now, just remove from map
		connMutex.Lock()
		delete(tcpConnections, connKey)
		connMutex.Unlock()
	}
}

// buildHttpResponse constructs a basic HTTP response.
func buildHttpResponse(statusCode int, statusText string, body string) []byte {
	var builder strings.Builder
	// Status Line
	builder.WriteString(fmt.Sprintf("HTTP/1.1 %d %s\r\n", statusCode, statusText))
	// Headers
	builder.WriteString(fmt.Sprintf("Content-Type: text/html; charset=utf-8\r\n"))
	builder.WriteString(fmt.Sprintf("Content-Length: %d\r\n", len(body)))
	builder.WriteString("Connection: close\r\n") // Simple: always close
	builder.WriteString("\r\n")                  // End of headers
	// Body
	builder.WriteString(body)
	return []byte(builder.String())
}
