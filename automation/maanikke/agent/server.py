"""Read-only Agent subset; deliberately bypass upstream auto-install and actions."""
import importlib.metadata
import json
import os
import sys
import traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))

if importlib.metadata.version('maafw') != '5.12.2':
    raise RuntimeError('Agent requires exactly maafw 5.12.2')
from maa.library import Library
import maa
Library.open(Path(maa.__file__).parent / 'bin', agent_server=True)
from maa.agent.agent_server import AgentServer
from maa.custom_recognition import CustomRecognition
import rotated_ocr  # Registers only the reused RotatedOCR recognition.

@AgentServer.custom_recognition('RotatedOCR')
class CheckedRotatedOCR(rotated_ocr.RotatedOCR):
    def analyze(self, context, argv):
        try:
            result=super().analyze(context,argv)
            # maafw 5.12.2 callbacks require None for a failed custom recognition.
            # Upstream's AnalyzeResult(box=None) can become a spurious zero-area hit.
            return result if result.box is not None and result.box[2]>0 and result.box[3]>0 else None
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            Path(os.environ['PHOTOS_AGENT_ERROR']).write_text(json.dumps({'error':str(error)}),encoding='utf-8')
            return None

@AgentServer.custom_recognition('PhotosAgentHealth')
class Health(CustomRecognition):
    def analyze(self, context, argv):
        return CustomRecognition.AnalyzeResult(box=(0,0,1,1),detail={'maafw':'5.12.2','reused':'RotatedOCR','readOnly':True})

if not AgentServer.start_up(sys.argv[1]):
    raise RuntimeError('Agent handshake failed')
print('Photos MaaNikke read-only Agent ready', flush=True)
AgentServer.join()
AgentServer.shut_down()
