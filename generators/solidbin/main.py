from flask import send_file, Flask, after_this_request

import solidbin_generator as generator
import solidbin_form as form
import solidbin_settings as settings
import grid_constants

import uuid
import os
import logging

logger = logging.getLogger('SBG')

def get_generator(settings):
    return generator.Generator(settings)

def process(form, constants, preview=False):
    # Copy the settings from the form
    s = settings.Settings()
    s.sizeUnitsX = form.sizeUnitsX.data
    s.sizeUnitsY = form.sizeUnitsY.data
    s.sizeUnitsZ = form.sizeUnitsZ.data
    s.addStackingLip = form.addStackingLip.data
    s.addMagnetHoles = form.addMagnetHoles.data
    s.magnetHoleDiameter = float(form.magnetHoleDiameter.data)
    s.addRemovalHoles = form.addRemovalHoles.data
    s.addScrewHoles = form.addScrewHoles.data
    
    # Default grid (Gridfinity)
    if not constants:
        g = grid_constants.Grid()
    else:
        g = constants
    
    # The 3D preview is always rendered from an STL, regardless of the chosen export format
    exportFormat = "stl" if preview else form.exportFormat.data

    # Construct the names for the temporary and downloaded file
    filename = "/tmpfiles/" + str(uuid.uuid4()) + "." + exportFormat

    # Generate the STL file
    gen = generator.Generator(s, g)
    gen.generate_stl(filename)

    # Delete the temp file after it was downloaded
    @after_this_request
    def delete_image(response):
        try:
            os.remove(filename)
        except Exception as ex:
            print(ex)
        return response

    logger.info(s)

    # For a preview, stream the STL inline so the browser can render it
    if preview:
        return send_file(filename, mimetype="model/stl")

    # Send the generated STL file to the client
    downloadName = "Solid Bin {0}x{1}x{2}.{3}".format(s.sizeUnitsX, s.sizeUnitsY, s.sizeUnitsZ, exportFormat)
    return send_file(filename, as_attachment=True, download_name=downloadName)

def get_form():
    return form.Form()

def handles(request, form):
    if form.id in request.form and form.validate_on_submit():
        return True
    
    return False