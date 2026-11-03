#!/usr/bin/env python3
"""Send one Ethernet broadcast ARP request with a shared source MAC.

Run only inside the isolated Containerlab test data plane (eth1).
"""
import socket
import struct
import sys

IFACE = "eth1"
SRC_MAC = bytes.fromhex("0200000000aa")
BROADCAST_MAC = b"\xff" * 6
SENDER_IP = sys.argv[1] if len(sys.argv) > 1 else "198.18.0.11"
TARGET_IP = "198.18.0.254"

ethernet = BROADCAST_MAC + SRC_MAC + struct.pack("!H", 0x0806)
arp = struct.pack("!HHBBH", 1, 0x0800, 6, 4, 1)
arp += SRC_MAC + socket.inet_aton(SENDER_IP)
arp += b"\x00" * 6 + socket.inet_aton(TARGET_IP)
frame = (ethernet + arp).ljust(60, b"\x00")

with socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0003)) as sock:
    sock.bind((IFACE, 0))
    sent = sock.send(frame)
print(f"Sent {sent} bytes on {IFACE}: src=02:00:00:00:00:aa, SPA={SENDER_IP}", flush=True)
