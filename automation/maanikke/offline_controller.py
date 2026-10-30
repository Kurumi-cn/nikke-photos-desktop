"""In-memory images for recognition tests; every input callback rejects."""
import numpy as np
from maa.controller import CustomController

class OfflineController(CustomController):
    def connect(self): return True
    def request_uuid(self): return 'photos-offline-readonly'
    def screencap(self): return np.zeros((720,1280,3),dtype=np.uint8)
    def get_features(self): return 0
    def start_app(self,*args): return False
    def stop_app(self,*args): return False
    def click(self,*args): return False
    def swipe(self,*args): return False
    def touch_down(self,*args): return False
    def touch_move(self,*args): return False
    def touch_up(self,*args): return False
    def click_key(self,*args): return False
    def input_text(self,*args): return False
    def key_down(self,*args): return False
    def key_up(self,*args): return False
