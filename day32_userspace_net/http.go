package main

import (
	"bufio"
	"bytes"
	"fmt"
	"log"
	"strings"

	"github.com/songgao/water"
)

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

func handleHTTPData(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	log.Printf("Handling HTTP data (%d bytes) for %s (Port: %d)", len(payload), conn.ConnectionKey(), conn.ServerPort)
	// NOTE: This simplified version parses the first segment as a full request.
	// Proper implementation requires buffering similar to TLS.
	method, uri, _, headers, err := parseHTTPRequest(payload)
	if err != nil {
		log.Printf("Failed to parse HTTP request for %s: %v", conn.ConnectionKey(), err)
		// TODO: Send HTTP 400 Bad Request response (Needs TLS record wrapping for port 443)
		return
	}

	log.Printf("HTTP Request Parsed: [%s %s ...] from %s:%d", method, uri, conn.ClientIP, conn.ClientPort)
	for k, v := range headers {
		log.Printf("  HTTP Header: %s: %s", k, v)
	}

	// --- Send HTTP 200 OK response ---
	responseText := ""
	if conn.ServerPort == 443 {
		responseText = "<html><body><h1>Hello from userspace HTTPS/1.1! (Port 443)</h1></body></html>"
	} else {
		responseText = "<html><body><h1>Hello from userspace HTTP/1.1! (Port 80)</h1></body></html>"
	}
	body := responseText
	responseHeaders := map[string]string{
		"Content-Type":   "text/html; charset=utf-8",
		"Content-Length": fmt.Sprintf("%d", len(body)),
		// "Connection":     "close", // Let TLS handle closure or client decide
	}
	statusLine := "HTTP/1.1 200 OK"
	var respBuilder strings.Builder
	respBuilder.WriteString(statusLine + "\r\n")
	for k, v := range responseHeaders {
		respBuilder.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	respBuilder.WriteString("\r\n")
	respBuilder.WriteString(body)
	httpRespBytes := []byte(respBuilder.String())

	// Send response differently based on port
	if conn.ServerPort == 443 {
		// --- Send response via TLS Record ---
		log.Printf("[TLS Info - %s] Sending HTTP response (%d bytes) as Application Data.", conn.ConnectionKey(), len(httpRespBytes))

		// Wrap the HTTP response in a TLS Application Data record
		appDataRecord, err := buildTLSRecord(TLSRecordTypeApplicationData, 0x0303, httpRespBytes) // Use TLS 1.2 version
		if err != nil {
			log.Printf("[TLS Error - %s] Failed to build Application Data record for HTTP response: %v", conn.ConnectionKey(), err)
			return
		}

		// Send the TLS record containing the HTTP response
		err = sendRawTLSRecord(ifce, conn, appDataRecord)
		if err != nil {
			log.Printf("[TLS Error - %s] Failed to send Application Data record for HTTP response: %v", conn.ConnectionKey(), err)
		} else {
			// ServerNextSeq is updated inside sendRawTLSRecord
			log.Printf("[TLS Info - %s] Sent HTTP response via TLS record. ServerNextSeq updated to %d.", conn.ConnectionKey(), conn.ServerNextSeq)
			// Don't send FIN here for TLS connections; rely on client FIN or TLS close_notify
		}
	} else {
		// --- Send response via raw TCP (Port 80) ---
		log.Printf("[HTTP Info - %s] Sending HTTP response (%d bytes) via raw TCP.", conn.ConnectionKey(), len(httpRespBytes))
		respFlags := uint8(TCPFlagPSH | TCPFlagACK | TCPFlagFIN) // Send FIN with response for plain HTTP
		err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
			conn.ServerNextSeq, conn.ClientNextSeq, respFlags, httpRespBytes)

		if err != nil {
			log.Printf("[HTTP Error - %s] Error sending HTTP 200 response via TCP: %v", conn.ConnectionKey(), err)
		} else {
			conn.ServerNextSeq += uint32(len(httpRespBytes)) + 1 // +1 for FIN
			conn.State = TCPStateFinWait1                        // We sent FIN
			log.Printf("[HTTP Info - %s] Sent HTTP 200 Response and FIN, entering FIN_WAIT_1.", conn.ConnectionKey())
		}
	}
}
